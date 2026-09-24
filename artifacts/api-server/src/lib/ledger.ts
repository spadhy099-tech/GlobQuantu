import { eq } from "drizzle-orm";
import {
  db,
  ledgerEntries,
  ledgerTransactions,
  type LedgerEntry,
} from "@workspace/db";

export type LedgerSide = "debit" | "credit";

export type LedgerLineInput = {
  accountId: string;
  side: LedgerSide;
  amount: number;
  currency: string;
};

export type PostLedgerTransactionInput = {
  sourceType: string;
  sourceId?: string;
  description: string;
  idempotencyKey: string;
  createdBy?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, string | number | boolean | null>;
  lines: LedgerLineInput[];
};

export class LedgerValidationError extends Error {
  statusCode = 400;
}

function validateBalancedLines(lines: LedgerLineInput[]): void {
  if (lines.length < 2) {
    throw new LedgerValidationError("A ledger transaction requires at least two entries");
  }

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new LedgerValidationError("Ledger entry amounts must be positive finite values");
    }
    const currency = line.currency.trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) {
      throw new LedgerValidationError("Ledger entry currency must be a three-letter code");
    }
    const current = totals.get(currency) ?? { debit: 0, credit: 0 };
    current[line.side] += line.amount;
    totals.set(currency, current);
  }

  for (const [currency, total] of totals) {
    if (Math.abs(total.debit - total.credit) > 0.00000001) {
      throw new LedgerValidationError(`Ledger transaction is not balanced for ${currency}`);
    }
  }
}

export async function postLedgerTransaction(
  input: PostLedgerTransactionInput,
): Promise<{ transaction: typeof ledgerTransactions.$inferSelect; entries: LedgerEntry[] }> {
  validateBalancedLines(input.lines);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey));

    if (existing) {
      const existingEntries = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.ledgerTransactionId, existing.id));
      return { transaction: existing, entries: existingEntries };
    }

    const transactionId = crypto.randomUUID();
    const [transaction] = await tx
      .insert(ledgerTransactions)
      .values({
        id: transactionId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        createdBy: input.createdBy ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        metadata: input.metadata,
      })
      .returning();

    if (!transaction) throw new Error("Ledger transaction was not persisted");

    const entries = await tx
      .insert(ledgerEntries)
      .values(
        input.lines.map((line) => ({
          id: crypto.randomUUID(),
          ledgerTransactionId: transactionId,
          ledgerAccountId: line.accountId,
          side: line.side,
          amount: line.amount.toFixed(8),
          currency: line.currency.trim().toLowerCase(),
        })),
      )
      .returning();

    return { transaction, entries };
  });
}