import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { kycStatuses, users } from "./vaultora";

export const kycReviews = pgTable(
  "kyc_reviews",
  {
    id: text("id").primaryKey(),
    kycStatusId: text("kyc_status_id")
      .notNull()
      .references(() => kycStatuses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decision: text("decision").notNull(),
    note: text("note"),
    providerReference: text("provider_reference"),
    evidenceReference: text("evidence_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("kyc_reviews_status_id_idx").on(table.kycStatusId),
    index("kyc_reviews_user_id_idx").on(table.userId),
  ],
);

export const amlFlags = pgTable(
  "aml_flags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kycStatusId: text("kyc_status_id").references(() => kycStatuses.id, {
      onDelete: "set null",
    }),
    flagType: text("flag_type").notNull(),
    severity: text("severity").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    providerReference: text("provider_reference"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("aml_flags_user_id_idx").on(table.userId),
    index("aml_flags_status_idx").on(table.status),
    index("aml_flags_severity_idx").on(table.severity),
  ],
);

export type KycReview = typeof kycReviews.$inferSelect;
export type AmlFlag = typeof amlFlags.$inferSelect;