import { db, auditLogs } from "@workspace/db";

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    metadata: input.metadata ?? {},
  });
}