import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("user"),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps,
});

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    phone: text("phone"),
    baseCurrency: text("base_currency").notNull().default("usd"),
    riskProfile: text("risk_profile"),
    address: jsonb("address").$type<{
      line1?: string;
      line2?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      country?: string;
    }>(),
    ...timestamps,
  },
  (table) => [index("profiles_user_id_idx").on(table.userId)],
);

export const kycStatuses = pgTable(
  "kyc_statuses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("not_started"),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    riskLevel: text("risk_level"),
    riskFlags: jsonb("risk_flags").$type<string[]>(),
    reviewNote: text("review_note"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("kyc_statuses_user_id_idx").on(table.userId),
    index("kyc_statuses_status_idx").on(table.status),
  ],
);

export const portfolios = pgTable(
  "portfolios",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull().default("usd"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [index("portfolios_user_id_idx").on(table.userId)],
);

export const holdings = pgTable(
  "holdings",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    assetType: text("asset_type").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull().default("0"),
    averageCost: numeric("average_cost", { precision: 24, scale: 8 }).notNull().default("0"),
    currentPrice: numeric("current_price", { precision: 24, scale: 8 }).notNull().default("0"),
    priceAsOf: timestamp("price_as_of", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("holdings_portfolio_id_idx").on(table.portfolioId),
    uniqueIndex("holdings_portfolio_symbol_idx").on(table.portfolioId, table.symbol),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("usd"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    externalReference: text("external_reference"),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    ...timestamps,
  },
  (table) => [
    index("transactions_user_id_idx").on(table.userId),
    index("transactions_status_idx").on(table.status),
    uniqueIndex("transactions_stripe_payment_intent_idx").on(table.stripePaymentIntentId),
  ],
);

export const fundingRequests = pgTable(
  "funding_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("usd"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    bankReference: text("bank_reference"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("funding_requests_user_id_idx").on(table.userId),
    index("funding_requests_status_idx").on(table.status),
    uniqueIndex("funding_requests_stripe_payment_intent_idx").on(
      table.stripePaymentIntentId,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_unread_idx").on(table.userId, table.readAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    ipAddress: text("ip_address"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("stripe_webhook_events_type_idx").on(table.type)],
);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type KycStatus = typeof kycStatuses.$inferSelect;
export type Portfolio = typeof portfolios.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type FundingRequest = typeof fundingRequests.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;