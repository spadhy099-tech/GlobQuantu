import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { brokerOrders, db } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { ensureAccount, isAdmin } from "../lib/account";
import { getBrokerAdapter, BrokerUnavailableError } from "../lib/broker";
import { isTradingEnabled, rejectDisabledCapability } from "../lib/capabilities";
import { validateOrderRisk, RiskViolationError } from "../lib/risk";

const router: IRouter = Router();
const orderSchema = z
  .object({
    symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(["market", "limit"]),
    quantity: z.number().finite().positive().max(1_000_000),
    limitPrice: z.number().finite().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.orderType === "limit" && value.limitPrice === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limitPrice"],
        message: "Limit orders require a verified limit price",
      });
    }
  });

async function requireTradingAdmin(
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

router.use(requireAuth);

router.get("/orders", async (req, res) => {
  const account = await ensureAccount(
    (req as AuthenticatedRequest).userId,
    null,
  );
  const rows = await db
    .select()
    .from(brokerOrders)
    .where(eq(brokerOrders.userId, account.user.id))
    .orderBy(desc(brokerOrders.createdAt))
    .limit(100);
  res.json(
    rows.map((order) => ({
      ...order,
      quantity: Number(order.quantity),
      limitPrice: order.limitPrice === null ? null : Number(order.limitPrice),
    })),
  );
});

router.post("/orders", async (req, res) => {
  if (!isTradingEnabled()) {
    rejectDisabledCapability(res, "trading");
    return;
  }

  const idempotencyKey = req.header("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    res.status(400).json({ error: "A valid Idempotency-Key header is required" });
    return;
  }

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Order data is invalid", details: parsed.error.flatten() });
    return;
  }

  const account = await ensureAccount(
    (req as AuthenticatedRequest).userId,
    null,
  );
  if (account.kyc.status !== "approved") {
    res.status(403).json({ error: "Approved KYC is required before order submission" });
    return;
  }

  try {
    await validateOrderRisk({
      userId: account.user.id,
      portfolioId: account.portfolio.id,
      side: parsed.data.side,
      quantity: parsed.data.quantity,
      limitPrice: parsed.data.limitPrice,
    });

    const adapter = getBrokerAdapter();
    const clientOrderId = crypto.randomUUID();
    const snapshot = await adapter.submitOrder({
      ...parsed.data,
      clientOrderId,
    });
    const [order] = await db
      .insert(brokerOrders)
      .values({
        id: crypto.randomUUID(),
        userId: account.user.id,
        portfolioId: account.portfolio.id,
        clientOrderId,
        externalOrderId: snapshot.externalOrderId,
        symbol: parsed.data.symbol.toUpperCase(),
        side: parsed.data.side,
        orderType: parsed.data.orderType,
        quantity: parsed.data.quantity.toFixed(8),
        limitPrice: parsed.data.limitPrice?.toFixed(8),
        status: snapshot.status,
        rejectionReason: snapshot.rejectionReason,
        idempotencyKey,
        submittedAt: snapshot.submittedAt,
        acceptedAt: snapshot.acceptedAt,
        completedAt: snapshot.completedAt,
      })
      .returning();

    if (!order) throw new Error("Broker order was not persisted");
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof RiskViolationError || error instanceof BrokerUnavailableError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.use("/admin", requireTradingAdmin);

router.get("/admin/orders", async (_req, res) => {
  const rows = await db
    .select()
    .from(brokerOrders)
    .orderBy(desc(brokerOrders.createdAt))
    .limit(200);
  res.json(rows);
});

export default router;