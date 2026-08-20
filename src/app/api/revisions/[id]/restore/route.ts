import { NextResponse } from "next/server";
import { withAuth, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

const RESTORABLE: Record<string, "expression" | "sentence" | "concept"> = {
  expression: "expression",
  sentence: "sentence",
  concept: "concept",
};

/**
 * Restore the old values captured in a revision back onto the entity.
 * Only scalar fields present in the revision snapshot are applied.
 */
export const POST = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const revision = await db.revision.findUnique({ where: { id } });
  if (!revision) throw new ApiError(404, "Revision not found");
  const model = RESTORABLE[revision.entityType];
  if (!model) throw new ApiError(400, `Restore is not supported for ${revision.entityType}`);
  const oldValue = revision.oldValue as Record<string, unknown> | null;
  if (!oldValue) throw new ApiError(400, "Revision has no previous values to restore");

  // Only restore known editable scalar fields; never ids/timestamps.
  const blocked = new Set(["id", "createdAt", "updatedAt", "textNormalized"]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(oldValue)) {
    if (!blocked.has(k)) data[k] = v;
  }
  if (typeof data.textOriginal === "string") {
    const { normalizeArabic } = await import("@/services/normalization");
    data.textNormalized = normalizeArabic(data.textOriginal);
  }

  const delegate = db[model] as unknown as {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  const before = await delegate.findUnique({ where: { id: revision.entityId } });
  if (!before) throw new ApiError(404, "Entity no longer exists");
  const updated = await delegate.update({ where: { id: revision.entityId }, data });
  await recordRevision(db, {
    entityType: revision.entityType,
    entityId: revision.entityId,
    kind: "RESTORE",
    oldValue: before,
    newValue: updated,
    userId: user.id,
    reason: `Restored from revision ${revision.id}`,
  });
  return NextResponse.json({ item: updated });
});
