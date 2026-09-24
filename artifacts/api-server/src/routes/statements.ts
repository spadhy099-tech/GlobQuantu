import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, fees, transactions } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { ensureAccount } from "../lib/account";

const router: IRouter = Router();

function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

router.use(requireAuth);

router.get("/statements.csv", async (req, res) => {
  const account = await ensureAccount(
    (req as AuthenticatedRequest).userId,
    null,
  );
  const [transactionRows, feeRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, account.user.id))
      .orderBy(desc(transactions.createdAt)),
    db
      .select()
      .from(fees)
      .where(eq(fees.userId, account.user.id))
      .orderBy(desc(fees.createdAt)),
  ]);

  const rows = [
    ["record_type", "id", "status", "type", "amount", "currency", "description", "created_at"],
    ...transactionRows.map((row) => [
      "transaction",
      row.id,
      row.status,
      row.type,
      row.amount,
      row.currency,
      row.description ?? "",
      row.createdAt,
    ]),
    ...feeRows.map((row) => [
      "fee",
      row.id,
      row.status,
      row.type,
      row.amount,
      row.currency,
      row.description ?? "",
      row.createdAt,
    ]),
  ];

  res
    .type("text/csv")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="vaultora-statement-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    .send(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
});

export default router;