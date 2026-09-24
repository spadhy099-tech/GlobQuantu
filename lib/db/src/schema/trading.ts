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

export const brokerAccounts = pgTable(
  "broker_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    environment: text("environment").notNull().default("sandbox"),
    externalAccountId: text("external_account_id"),
    status: text("status").notNull().default("unconfigured"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("broker_accounts_user_id_idx").on(table.userId),
    uniqueIndex("broker_accounts_provider_external_idx").on(
      table.provider,
      table.externalAccountId,
    ),
  ],
);

export const brokerOrders = pgTable(
  "broker_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    brokerAccountId: text("broker_account_id").references(() => brokerAccounts.id, {
      onDelete: "set null",
    }),
    clientOrderId: text("client_order_id").notNull(),
    externalOrderId: text("external_order_id"),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    orderType: text("order_type").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    limitPrice: numeric("limit_price", { precision: 24, scale: 8 }),
    status: text("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("broker_orders_client_order_id_idx").on(table.clientOrderId),
    uniqueIndex("broker_orders_idempotency_key_idx").on(table.idempotencyKey),
    index("broker_orders_user_id_idx").on(table.userId),
    index("broker_orders_status_idx").on(table.status),
    index("broker_orders_external_id_idx").on(table.externalOrderId),
  ],
);

export const brokerExecutions = pgTable(
  "broker_executions",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => brokerOrders.id, { onDelete: "cascade" }),
    externalExecutionId: text("external_execution_id").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    price: numeric("price", { precision: 24, scale: 8 }).notNull(),
    fees: numeric("fees", { precision: 24, scale: 8 }).notNull().default("0"),
    currency: text("currency").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("broker_executions_external_id_idx").on(table.externalExecutionId),
    index("broker_executions_order_id_idx").on(table.orderId),
  ],
);

export const riskLimits = pgTable(
  "risk_limits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
    maxPositionValue: numeric("max_position_value", { precision: 24, scale: 8 }),
    maxExposureValue: numeric("max_exposure_value", { precision: 24, scale: 8 }),
    maxOrderValue: numeric("max_order_value", { precision: 24, scale: 8 }),
    maxDailyLoss: numeric("max_daily_loss", { precision: 24, scale: 8 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("risk_limits_user_id_idx").on(table.userId),
    index("risk_limits_portfolio_id_idx").on(table.portfolioId),
  ],
);

export const tradingControls = pgTable(
  "trading_controls",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    scopeId: text("scope_id"),
    status: text("status").notNull().default("paused"),
    reason: text("reason").notNull(),
    changedBy: text("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("trading_controls_scope_idx").on(table.scope, table.scopeId),
    index("trading_controls_status_idx").on(table.status),
  ],
);

export type BrokerAccount = typeof brokerAccounts.$inferSelect;
export type BrokerOrder = typeof brokerOrders.$inferSelect;
export type BrokerExecution = typeof brokerExecutions.$inferSelect;
export type RiskLimit = typeof riskLimits.$inferSelect;
export type TradingControl = typeof tradingControls.$inferSelect;