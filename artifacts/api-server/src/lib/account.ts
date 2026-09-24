import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  fundingRequests,
  kycStatuses,
  portfolios,
  profiles,
  transactions,
  users,
} from "@workspace/db";

export type ClaimMap = Record<string, unknown> | null | undefined;

function claimString(claims: ClaimMap, key: string): string | null {
  const value = claims?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function ensureAccount(
  userId: string,
  claims?: ClaimMap,
): Promise<{
  user: typeof users.$inferSelect;
  profile: typeof profiles.$inferSelect;
  kyc: typeof kycStatuses.$inferSelect;
  portfolio: typeof portfolios.$inferSelect;
}> {
  const email = claimString(claims, "email");
  const firstName = claimString(claims, "firstName");
  const lastName = claimString(claims, "lastName");

  await db
    .insert(users)
    .values({ id: userId, email, firstName, lastName })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: email ?? undefined,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(profiles)
    .values({ userId })
    .onConflictDoNothing();

  await db
    .insert(kycStatuses)
    .values({ id: crypto.randomUUID(), userId })
    .onConflictDoNothing();

  let [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(portfolios.createdAt)
    .limit(1);

  if (!portfolio) {
    [portfolio] = await db
      .insert(portfolios)
      .values({
        id: crypto.randomUUID(),
        userId,
        name: "Primary portfolio",
      })
      .returning();
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const [kyc] = await db
    .select()
    .from(kycStatuses)
    .where(eq(kycStatuses.userId, userId));

  if (!user || !profile || !kyc || !portfolio) {
    throw new Error("Unable to initialize account");
  }

  return { user, profile, kyc, portfolio };
}

export async function getCashBalance(userId: string, currency?: string): Promise<number> {
  const conditions = [eq(transactions.userId, userId)];
  if (currency) conditions.push(eq(transactions.currency, currency.toLowerCase()));
  const rows = await db
    .select({
      type: transactions.type,
      status: transactions.status,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(and(...conditions));

  return rows.reduce((total, row) => {
    if (row.status !== "completed") return total;
    const amount = Number(row.amount);
    return total + (row.type === "deposit" ? amount : row.type === "withdrawal" ? -amount : 0);
  }, 0);
}

export async function getAvailableCashBalance(userId: string, currency: string): Promise<number> {
  const cashBalance = await getCashBalance(userId, currency);
  const pending = await db
    .select({ amount: fundingRequests.amount })
    .from(fundingRequests)
    .where(
      and(
        eq(fundingRequests.userId, userId),
        eq(fundingRequests.type, "withdrawal"),
        eq(fundingRequests.currency, currency.toLowerCase()),
        inArray(fundingRequests.status, ["pending", "approved", "processing"]),
      ),
    );

  return cashBalance - pending.reduce((total, row) => total + Number(row.amount), 0);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const configuredIds = (process.env.VAULTORA_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredIds.includes(userId)) return true;

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));

  return user?.role === "admin";
}

export function serializeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function serializeProfile(profile: typeof profiles.$inferSelect) {
  return {
    userId: profile.userId,
    phone: profile.phone,
    baseCurrency: profile.baseCurrency,
    riskProfile: profile.riskProfile,
    address: profile.address,
  };
}

export function serializeKyc(kyc: typeof kycStatuses.$inferSelect) {
  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    provider: kyc.provider,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt,
    expiresAt: kyc.expiresAt,
    lastCheckedAt: kyc.lastCheckedAt,
    riskLevel: kyc.riskLevel,
    riskFlags: kyc.riskFlags,
    reviewNote: kyc.reviewNote,
  };
}

export function serializeFundingRequest(request: typeof fundingRequests.$inferSelect) {
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    amount: Number(request.amount),
    currency: request.currency,
    stripePaymentIntentId: request.stripePaymentIntentId,
    reviewNote: request.reviewNote,
    createdAt: request.createdAt,
  };
}

export function serializeTransaction(transaction: typeof transactions.$inferSelect) {
  return {
    id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    description: transaction.description,
    createdAt: transaction.createdAt,
  };
}

export async function getRecentUserData(userId: string) {
  const [userTransactions, requests] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(100),
    db
      .select()
      .from(fundingRequests)
      .where(eq(fundingRequests.userId, userId))
      .orderBy(desc(fundingRequests.createdAt))
      .limit(50),
  ]);

  return { userTransactions, requests };
}