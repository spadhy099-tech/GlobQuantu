import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { amlFlags, db, kycReviews, kycStatuses } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { ensureAccount, isAdmin } from "../lib/account";
import { getKycProvider } from "../lib/kycProvider";
import { isKycReviewEnabled, rejectDisabledCapability } from "../lib/capabilities";
import { writeAuditLog } from "../lib/audit";

const router: IRouter = Router();
const reviewSchema = z.object({
  status: z.enum(["approved", "rejected", "expired"]),
  reviewNote: z.string().trim().max(500).optional(),
  providerReference: z.string().trim().max(200).optional(),
});
const flagSchema = z.object({
  status: z.enum(["open", "investigating", "resolved"]),
  resolution: z.string().trim().max(500).optional(),
});

async function requireComplianceAdmin(
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

router.use("/admin", requireComplianceAdmin);

router.get("/admin/kyc", async (_req, res) => {
  const rows = await db
    .select()
    .from(kycStatuses)
    .orderBy(desc(kycStatuses.updatedAt))
    .limit(200);
  res.json(rows);
});

router.patch("/admin/kyc/:id", async (req, res) => {
  if (!isKycReviewEnabled()) {
    rejectDisabledCapability(res, "kyc_review");
    return;
  }

  const reviewerUserId = (req as unknown as AuthenticatedRequest).userId;
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "KYC review data is invalid", details: parsed.error.flatten() });
    return;
  }

  const [current] = await db
    .select()
    .from(kycStatuses)
    .where(eq(kycStatuses.id, req.params.id));
  if (!current) {
    res.status(404).json({ error: "KYC record not found" });
    return;
  }

  if (parsed.data.status === "approved") {
    if (!parsed.data.providerReference) {
      res.status(400).json({ error: "Provider evidence is required before approval" });
      return;
    }
    const provider = getKycProvider();
    if (!provider) {
      res.status(503).json({ error: "KYC provider is not configured", code: "KYC_PROVIDER_NOT_CONFIGURED" });
      return;
    }
    const providerResult = await provider.getVerification(parsed.data.providerReference);
    if (
      providerResult.providerReference !== parsed.data.providerReference ||
      providerResult.status !== "approved"
    ) {
      res.status(409).json({ error: "KYC provider has not approved this verification" });
      return;
    }
  }

  const expiresAt =
    parsed.data.status === "approved"
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : null;
  const [updated] = await db.transaction(async (tx) => {
    const [status] = await tx
      .update(kycStatuses)
      .set({
        status: parsed.data.status,
        providerReference: parsed.data.providerReference ?? current.providerReference,
        reviewedAt: new Date(),
        expiresAt,
        reviewNote: parsed.data.reviewNote ?? null,
        updatedAt: new Date(),
      })
      .where(eq(kycStatuses.id, current.id))
      .returning();
    await tx.insert(kycReviews).values({
      id: crypto.randomUUID(),
      kycStatusId: current.id,
      userId: current.userId,
      reviewerUserId,
      decision: parsed.data.status,
      note: parsed.data.reviewNote,
      providerReference: parsed.data.providerReference ?? current.providerReference,
    });
    return [status];
  });

  await writeAuditLog({
    actorUserId: reviewerUserId,
    action: `kyc.${parsed.data.status}`,
    entityType: "kyc_status",
    entityId: current.id,
    ipAddress: req.ip,
    metadata: { userId: current.userId, providerReference: parsed.data.providerReference ?? null },
  });

  res.json(updated);
});

router.get("/admin/aml-flags", async (_req, res) => {
  const rows = await db
    .select()
    .from(amlFlags)
    .orderBy(desc(amlFlags.createdAt))
    .limit(200);
  res.json(rows);
});

router.patch("/admin/aml-flags/:id", async (req, res) => {
  const reviewerUserId = (req as unknown as AuthenticatedRequest).userId;
  const parsed = flagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "AML flag data is invalid", details: parsed.error.flatten() });
    return;
  }

  const [updated] = await db
    .update(amlFlags)
    .set({
      status: parsed.data.status,
      resolution: parsed.data.resolution ?? null,
      resolvedBy: parsed.data.status === "resolved" ? reviewerUserId : null,
      resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(amlFlags.id, req.params.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "AML flag not found" });
    return;
  }

  await writeAuditLog({
    actorUserId: reviewerUserId,
    action: `aml_flag.${parsed.data.status}`,
    entityType: "aml_flag",
    entityId: updated.id,
    ipAddress: req.ip,
    metadata: { userId: updated.userId },
  });
  res.json(updated);
});

export default router;