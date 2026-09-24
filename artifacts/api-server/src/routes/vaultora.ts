import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  amlFlags,
  auditLogs,
  db,
  fees,
  fundingRequests,
  holdings,
  kycStatuses,
  notifications,
  portfolios,
  profiles,
  transactions,
  users,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  ensureAccount,
  getAvailableCashBalance,
  getCashBalance,
  getRecentUserData,
  isAdmin,
  serializeFundingRequest,
  serializeKyc,
  serializeProfile,
  serializeTransaction,
  serializeUser,
} from "../lib/account";
import { writeAuditLog } from "../lib/audit";
import { getStripeCredentials, getUncachableStripeClient } from "../stripeClient";
import {
  isMoneyMovementEnabled,
  rejectDisabledCapability,
} from "../lib/capabilities";
import { getKycProvider } from "../lib/kycProvider";

class RequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const router: IRouter = Router();
const currencySchema = z.string().regex(/^[a-zA-Z]{3}$/, "Currency must be a 3-letter code");
const fundingSchema = z.object({
  amount: z.number().finite().positive().max(1_000_000),
  currency: currencySchema.default("usd"),
});
const profileSchema = z.object({
  phone: z.string().trim().max(40).optional(),
  baseCurrency: currencySchema.optional(),
  riskProfile: z.enum(["conservative", "balanced", "growth", "aggressive"]).optional(),
  address: z
    .object({
      line1: z.string().max(120).optional(),
      line2: z.string().max(120).optional(),
      city: z.string().max(80).optional(),
      region: z.string().max(80).optional(),
      postalCode: z.string().max(24).optional(),
      country: z.string().max(2).optional(),
    })
    .optional(),
});
const kycSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.coerce.date(),
  country: z.string().trim().length(2),
});
const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(500).optional(),
});

function getClaims(req: Request) {
  return (getAuth(req).sessionClaims ?? null) as Record<string, unknown> | null;
}

async function getAccount(req: Request) {
  const userId = (req as AuthenticatedRequest).userId;
  return ensureAccount(userId, getClaims(req));
}

async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req as AuthenticatedRequest).userId;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
}

function serializeHolding(holding: typeof holdings.$inferSelect) {
  const quantity = Number(holding.quantity);
  const currentPrice = Number(holding.currentPrice);
  return {
    id: holding.id,
    symbol: holding.symbol,
    name: holding.name,
    assetType: holding.assetType,
    quantity,
    averageCost: Number(holding.averageCost),
    currentPrice,
    marketValue: quantity * currentPrice,
    unrealizedPnl: quantity * (currentPrice - Number(holding.averageCost)),
    priceAsOf: holding.priceAsOf,
  };
}

function serializePortfolio(
  portfolio: typeof portfolios.$inferSelect,
  portfolioHoldings: Array<typeof holdings.$inferSelect>,
  metrics: {
    realizedPnl: number | null;
    fees: number | null;
  } = { realizedPnl: null, fees: null },
) {
  const investedAmount = portfolioHoldings.reduce(
    (total, holding) => total + Number(holding.quantity) * Number(holding.averageCost),
    0,
  );
  const unrealizedPnl = portfolioHoldings.reduce(
    (total, holding) =>
      total + Number(holding.quantity) * (Number(holding.currentPrice) - Number(holding.averageCost)),
    0,
  );
  return {
    id: portfolio.id,
    userId: portfolio.userId,
    name: portfolio.name,
    baseCurrency: portfolio.baseCurrency,
    status: portfolio.status,
    balance: portfolioHoldings.reduce(
      (total, holding) => total + Number(holding.quantity) * Number(holding.currentPrice),
      0,
    ),
    investedAmount: portfolioHoldings.length ? investedAmount : null,
    realizedPnl: metrics.realizedPnl,
    unrealizedPnl: portfolioHoldings.length ? unrealizedPnl : null,
    fees: metrics.fees,
  };
}

function getNumericMetadata(
  metadata: Record<string, string | number | boolean | null> | null,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getVerifiedMetrics(
  transactionRows: Array<typeof transactions.$inferSelect>,
  feeRows: Array<typeof fees.$inferSelect>,
) {
  const realizedValues = transactionRows
    .filter((row) => row.status === "completed" && row.type === "trade_sell")
    .map((row) => getNumericMetadata(row.metadata, "realizedPnl"))
    .filter((value): value is number => value !== null);
  return {
    realizedPnl: realizedValues.length
      ? realizedValues.reduce((total, value) => total + value, 0)
      : null,
    fees: feeRows.length
      ? feeRows.reduce((total, fee) => total + Number(fee.amount), 0)
      : null,
  };
}

router.use(requireAuth);

router.get("/auth/user", async (req, res) => {
  const account = await getAccount(req);
  res.json({
    user: serializeUser(account.user),
    profile: serializeProfile(account.profile),
    kyc: serializeKyc(account.kyc),
  });
});

router.get("/dashboard", async (req, res) => {
  const account = await getAccount(req);
  const [portfolioHoldings, userNotifications, recent] = await Promise.all([
    db
      .select()
      .from(holdings)
      .where(eq(holdings.portfolioId, account.portfolio.id))
      .orderBy(desc(holdings.updatedAt)),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, account.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20),
    getRecentUserData(account.user.id),
  ]);
  const feeRows = await db
    .select()
    .from(fees)
    .where(eq(fees.userId, account.user.id))
    .orderBy(desc(fees.createdAt))
    .limit(100);
  const metrics = getVerifiedMetrics(recent.userTransactions, feeRows);
  const cashBalance = await getCashBalance(account.user.id, account.profile.baseCurrency);
  const portfolioValue = portfolioHoldings.reduce(
    (total, holding) => total + Number(holding.quantity) * Number(holding.currentPrice),
    0,
  );

  res.json({
    user: serializeUser(account.user),
    profile: serializeProfile(account.profile),
    kyc: serializeKyc(account.kyc),
    portfolio: serializePortfolio(account.portfolio, portfolioHoldings, metrics),
    holdings: portfolioHoldings.map(serializeHolding),
    transactions: recent.userTransactions.map(serializeTransaction),
    fundingRequests: recent.requests.map(serializeFundingRequest),
    notifications: userNotifications,
    cashBalance,
    portfolioValue,
    investedAmount: portfolioHoldings.length
      ? portfolioHoldings.reduce(
          (total, holding) => total + Number(holding.quantity) * Number(holding.averageCost),
          0,
        )
      : null,
    realizedPnl: metrics.realizedPnl,
    unrealizedPnl: portfolioHoldings.length
      ? portfolioHoldings.reduce(
          (total, holding) =>
            total +
            Number(holding.quantity) *
              (Number(holding.currentPrice) - Number(holding.averageCost)),
          0,
        )
      : null,
    fees: metrics.fees,
  });
});

router.patch("/profile", async (req, res) => {
  const account = await getAccount(req);
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Profile data is invalid", details: parsed.error.flatten() });
    return;
  }

  const [profile] = await db
    .update(profiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(profiles.userId, account.user.id))
    .returning();

  await writeAuditLog({
    actorUserId: account.user.id,
    action: "profile.updated",
    entityType: "profile",
    entityId: account.user.id,
    ipAddress: req.ip,
  });

  res.json(serializeProfile(profile));
});

router.get("/kyc", async (req, res) => {
  const account = await getAccount(req);
  res.json(serializeKyc(account.kyc));
});

router.post("/kyc", async (req, res) => {
  const account = await getAccount(req);
  const parsed = kycSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.dateOfBirth > new Date()) {
    res.status(400).json({ error: "KYC information is invalid", details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }

  const provider = getKycProvider();
  if (!provider) {
    res.status(503).json({
      error: "KYC provider is not configured",
      code: "KYC_PROVIDER_NOT_CONFIGURED",
    });
    return;
  }

  const providerResult = await provider.createVerification({
    userId: account.user.id,
    fullName: parsed.data.fullName,
    dateOfBirth: parsed.data.dateOfBirth,
    country: parsed.data.country.toUpperCase(),
  });
  const nextStatus =
    providerResult.status === "rejected" || providerResult.status === "expired"
      ? providerResult.status
      : "pending";

  const [kyc] = await db
    .update(kycStatuses)
    .set({
      status: nextStatus,
      provider: process.env.VAULTORA_KYC_PROVIDER ?? null,
      providerReference: providerResult.providerReference,
      submittedAt: new Date(),
      reviewedAt: null,
      expiresAt: null,
      lastCheckedAt: new Date(),
      riskLevel: providerResult.riskLevel ?? null,
      riskFlags: providerResult.riskFlags ?? null,
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(eq(kycStatuses.userId, account.user.id))
    .returning();

  if (providerResult.riskFlags?.length) {
    await db.insert(amlFlags).values(
      providerResult.riskFlags.map((flag) => ({
        id: crypto.randomUUID(),
        userId: account.user.id,
        kycStatusId: kyc.id,
        flagType: flag,
        severity: providerResult.riskLevel === "high" ? "high" : "medium",
        status: "open",
        providerReference: providerResult.providerReference,
      })),
    );
  }

  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: account.user.id,
    type: "kyc_submitted",
    title: "Verification submitted",
    body:
      nextStatus === "rejected"
        ? "The KYC provider rejected this verification. Please review the account message before resubmitting."
        : nextStatus === "expired"
          ? "This verification has expired and must be completed again."
          : "Your identity information is queued for review. We will notify you when the status changes.",
  });
  await writeAuditLog({
    actorUserId: account.user.id,
    action: "kyc.submitted",
    entityType: "kyc_status",
    entityId: kyc.id,
    ipAddress: req.ip,
    metadata: { country: parsed.data.country },
  });

  res.status(201).json(serializeKyc(kyc));
});

router.get("/portfolios", async (req, res) => {
  const account = await getAccount(req);
  const userPortfolios = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, account.user.id))
    .orderBy(portfolios.createdAt);
  const allHoldings = await db
    .select()
    .from(holdings)
    .where(inArray(holdings.portfolioId, userPortfolios.map((portfolio) => portfolio.id)));

  res.json(
    userPortfolios.map((portfolio) =>
      serializePortfolio(
        portfolio,
        allHoldings.filter((holding) => holding.portfolioId === portfolio.id),
      ),
    ),
  );
});

router.get("/transactions", async (req, res) => {
  const account = await getAccount(req);
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, account.user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  res.json(rows.map(serializeTransaction));
});

router.get("/funding-requests", async (req, res) => {
  const account = await getAccount(req);
  const rows = await db
    .select()
    .from(fundingRequests)
    .where(eq(fundingRequests.userId, account.user.id))
    .orderBy(desc(fundingRequests.createdAt))
    .limit(100);
  res.json(rows.map(serializeFundingRequest));
});

router.post("/funding-requests/deposit", async (req, res) => {
  if (!isMoneyMovementEnabled()) {
    rejectDisabledCapability(res, "funding");
    return;
  }

  const account = await getAccount(req);
  const parsed = fundingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Deposit amount is invalid", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.currency.toLowerCase() !== account.profile.baseCurrency.toLowerCase()) {
    res.status(400).json({ error: "Funding currency must match your account base currency" });
    return;
  }

  const amountCents = Math.round(parsed.data.amount * 100);
  if (amountCents < 50) {
    res.status(400).json({ error: "Deposits must be at least 0.50 in the selected currency" });
    return;
  }

  const requestId = crypto.randomUUID();
  const stripe = await getUncachableStripeClient();
  let customerId = account.user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: account.user.email ?? undefined,
      metadata: { vaultoraUserId: account.user.id },
    });
    customerId = customer.id;
    await db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, account.user.id));
  }

  await db.transaction(async (tx) => {
    await tx.insert(fundingRequests).values({
      id: requestId,
      userId: account.user.id,
      type: "deposit",
      status: "pending",
      amount: parsed.data.amount.toFixed(2),
      currency: parsed.data.currency.toLowerCase(),
    });
    await tx.insert(transactions).values({
      id: requestId,
      userId: account.user.id,
      portfolioId: account.portfolio.id,
      type: "deposit",
      status: "pending",
      amount: parsed.data.amount.toFixed(2),
      currency: parsed.data.currency.toLowerCase(),
      description: "Stripe deposit",
    });
  });

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: parsed.data.currency.toLowerCase(),
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        description: "Vaultora portfolio deposit",
        metadata: { vaultoraUserId: account.user.id, fundingRequestId: requestId },
      },
      { idempotencyKey: `vaultora_deposit_${requestId}` },
    );

    await db
      .update(fundingRequests)
      .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
      .where(eq(fundingRequests.id, requestId));
    await db
      .update(transactions)
      .set({ stripePaymentIntentId: intent.id, updatedAt: new Date() })
      .where(eq(transactions.id, requestId));

    const { publishableKey } = await getStripeCredentials();
    if (!intent.client_secret) throw new Error("Stripe did not return a client secret");

    await writeAuditLog({
      actorUserId: account.user.id,
      action: "funding.deposit_created",
      entityType: "funding_request",
      entityId: requestId,
      ipAddress: req.ip,
      metadata: { paymentIntentId: intent.id, amount: parsed.data.amount },
    });

    res.status(201).json({
      requestId,
      clientSecret: intent.client_secret,
      publishableKey: publishableKey ?? null,
      status: intent.status,
    });
  } catch (error) {
    await db
      .update(fundingRequests)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(fundingRequests.id, requestId));
    await db
      .update(transactions)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(transactions.id, requestId));
    throw error;
  }
});

router.post("/funding-requests/withdrawal", async (req, res) => {
  if (!isMoneyMovementEnabled()) {
    rejectDisabledCapability(res, "funding");
    return;
  }

  const account = await getAccount(req);
  const parsed = fundingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Withdrawal amount is invalid", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.currency.toLowerCase() !== account.profile.baseCurrency.toLowerCase()) {
    res.status(400).json({ error: "Funding currency must match your account base currency" });
    return;
  }

  const requestId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from users where id = ${account.user.id} for update`,
    );
    const [completedRows, reservedRows] = await Promise.all([
      tx
        .select({ type: transactions.type, amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, account.user.id),
            eq(transactions.currency, account.profile.baseCurrency.toLowerCase()),
            eq(transactions.status, "completed"),
          ),
        ),
      tx
        .select({ amount: fundingRequests.amount })
        .from(fundingRequests)
        .where(
          and(
            eq(fundingRequests.userId, account.user.id),
            eq(fundingRequests.currency, account.profile.baseCurrency.toLowerCase()),
            eq(fundingRequests.type, "withdrawal"),
            inArray(fundingRequests.status, ["pending", "approved", "processing"]),
          ),
        ),
    ]);
    const available =
      completedRows.reduce(
        (total, row) =>
          total +
          (row.type === "deposit" ? Number(row.amount) : row.type === "withdrawal" ? -Number(row.amount) : 0),
        0,
      ) - reservedRows.reduce((total, row) => total + Number(row.amount), 0);
    if (parsed.data.amount > available) {
      throw new RequestError("Withdrawal exceeds available cash balance", 400);
    }
    await tx.insert(fundingRequests).values({
      id: requestId,
      userId: account.user.id,
      type: "withdrawal",
      status: "pending",
      amount: parsed.data.amount.toFixed(2),
      currency: parsed.data.currency.toLowerCase(),
    });
    await tx.insert(transactions).values({
      id: requestId,
      userId: account.user.id,
      portfolioId: account.portfolio.id,
      type: "withdrawal",
      status: "pending",
      amount: parsed.data.amount.toFixed(2),
      currency: parsed.data.currency.toLowerCase(),
      description: "Withdrawal request pending review",
    });
    await tx.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: account.user.id,
      type: "withdrawal_submitted",
      title: "Withdrawal request received",
      body: "Your request is pending review. It will not reduce your balance until it is completed.",
    });
  });

  await writeAuditLog({
    actorUserId: account.user.id,
    action: "funding.withdrawal_created",
    entityType: "funding_request",
    entityId: requestId,
    ipAddress: req.ip,
    metadata: { amount: parsed.data.amount },
  });

  const [request] = await db
    .select()
    .from(fundingRequests)
    .where(eq(fundingRequests.id, requestId));
  if (!request) {
    res.status(500).json({ error: "Withdrawal request was not persisted" });
    return;
  }
  res.status(201).json(serializeFundingRequest(request));
});

router.get("/notifications", async (req, res) => {
  const account = await getAccount(req);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, account.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  res.json(rows);
});

router.post("/notifications/:id/read", async (req, res) => {
  const account = await getAccount(req);
  const [notification] = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, req.params.id),
        eq(notifications.userId, account.user.id),
      ),
    )
    .returning();
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(notification);
});

router.use("/admin", requireAdmin);

router.get("/admin/funding-requests", async (req, res) => {
  await getAccount(req);
  const rows = await db
    .select()
    .from(fundingRequests)
    .orderBy(desc(fundingRequests.createdAt))
    .limit(200);
  res.json(rows.map(serializeFundingRequest));
});

router.patch("/admin/funding-requests/:id", async (req, res) => {
  if (!isMoneyMovementEnabled()) {
    rejectDisabledCapability(res, "funding");
    return;
  }

  const account = await getAccount(req);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Review status is invalid", details: parsed.error.flatten() });
    return;
  }

  const [request] = await db
    .select()
    .from(fundingRequests)
    .where(eq(fundingRequests.id, req.params.id));
  if (!request) {
    res.status(404).json({ error: "Funding request not found" });
    return;
  }
  if (request.type !== "withdrawal" || request.status !== "pending") {
    res.status(400).json({ error: "Only pending withdrawals can be reviewed here" });
    return;
  }

  const [updated] = await db
    .update(fundingRequests)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote ?? null,
      reviewedBy: account.user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(fundingRequests.id, request.id))
    .returning();
  await db
    .update(transactions)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(transactions.id, request.id));
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: request.userId,
    type: `withdrawal_${parsed.data.status}`,
    title: parsed.data.status === "approved" ? "Withdrawal approved" : "Withdrawal declined",
    body:
      parsed.data.reviewNote ??
      (parsed.data.status === "approved"
        ? "Your withdrawal is approved for processing by the configured payout rail."
        : "Your withdrawal request was declined. No money was moved."),
  });
  await writeAuditLog({
    actorUserId: account.user.id,
    action: `funding.withdrawal_${parsed.data.status}`,
    entityType: "funding_request",
    entityId: request.id,
    ipAddress: req.ip,
    metadata: { userId: request.userId, reviewNote: parsed.data.reviewNote ?? null },
  });

  res.json(serializeFundingRequest(updated));
});

router.get("/admin/audit-logs", async (req, res) => {
  await getAccount(req);
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  res.json(rows);
});

export default router;