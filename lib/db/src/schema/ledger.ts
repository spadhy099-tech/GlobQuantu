import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { portfolios, users } from "./vaultora";

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    currency: text("currency").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ledger_accounts_code_idx").on(table.code),
    index("ledger_accounts_owner_user_id_idx").on(table.ownerUserId),
    index("ledger_accounts_portfolio_id_idx").on(table.portfolioId),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    status: text("status").notNull().default("posted"),
    description: text("description").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ledger_transactions_idempotency_key_idx").on(table.idempotencyKey),
    index("ledger_transactions_source_idx").on(table.sourceType, table.sourceId),
    index("ledger_transactions_occurred_at_idx").on(table.occurredAt),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    ledgerTransactionId: text("ledger_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    ledgerAccountId: text("ledger_account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    side: text("side").notNull(),
    amount: numeric("amount", { precision: 24, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entries_transaction_id_idx").on(table.ledgerTransactionId),
    index("ledger_entries_account_id_idx").on(table.ledgerAccountId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull().default("processing"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_scope_key_idx").on(table.scope, table.key),
    index("idempotency_keys_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const reconciliationRecords = pgTable(
  "reconciliation_records",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalReference: text("external_reference").notNull(),
    ledgerTransactionId: text("ledger_transaction_id").references(() => ledgerTransactions.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("unmatched"),
    expectedAmount: numeric("expected_amount", { precision: 24, scale: 8 }),
    settledAmount: numeric("settled_amount", { precision: 24, scale: 8 }),
    currency: text("currency").notNull(),
    discrepancy: numeric("discrepancy", { precision: 24, scale: 8 }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("reconciliation_source_reference_idx").on(
      table.source,
      table.externalReference,
    ),
    index("reconciliation_status_idx").on(table.status),
  ],
);

export const fees = pgTable(
  "fees",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "set null" }),
    ledgerTransactionId: text("ledger_transaction_id").references(() => ledgerTransactions.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    status: text("status").notNull().default("accrued"),
    amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    description: text("description"),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("fees_user_id_idx").on(table.userId),
    index("fees_portfolio_id_idx").on(table.portfolioId),
    index("fees_status_idx").on(table.status),
  ],
);

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type ReconciliationRecord = typeof reconciliationRecords.$inferSelect;
export type Fee = typeof fees.$inferSelect;