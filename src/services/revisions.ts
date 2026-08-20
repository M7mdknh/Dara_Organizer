import type { Prisma, PrismaClient, RevisionKind } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Append-only revision trail. Every meaningful create/update/delete on a
 * linguistic entity records old and new values so edits are auditable and
 * restorable from the UI.
 */
export async function recordRevision(
  tx: Tx,
  params: {
    entityType: string;
    entityId: string;
    kind: RevisionKind;
    oldValue?: unknown;
    newValue?: unknown;
    userId?: string | null;
    reason?: string | null;
  },
) {
  return tx.revision.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      kind: params.kind,
      oldValue: params.oldValue === undefined ? undefined : (params.oldValue as Prisma.InputJsonValue),
      newValue: params.newValue === undefined ? undefined : (params.newValue as Prisma.InputJsonValue),
      userId: params.userId ?? null,
      reason: params.reason ?? null,
    },
  });
}

export async function listRevisions(entityType: string, entityId: string) {
  return db.revision.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
  });
}

/** Extract only changed fields between two plain objects (for compact diffs). */
export function diffFields(oldObj: Record<string, unknown>, newObj: Record<string, unknown>) {
  const oldDiff: Record<string, unknown> = {};
  const newDiff: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    const a = oldObj[key];
    const b = newObj[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldDiff[key] = a ?? null;
      newDiff[key] = b ?? null;
    }
  }
  return { oldDiff, newDiff };
}
