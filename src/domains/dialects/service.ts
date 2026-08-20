import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { recordRevision } from "@/services/revisions";

export async function listDialectTree() {
  const nodes = await db.dialectNode.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return nodes;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createDialect(
  data: { name: string; nameAr?: string | null; description?: string | null; parentId?: string | null },
  userId: string,
) {
  const base = slugify(data.name) || "dialect";
  let slug = base;
  for (let i = 2; await db.dialectNode.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const created = await db.dialectNode.create({ data: { ...data, slug } });
  await recordRevision(db, { entityType: "dialect", entityId: created.id, kind: "CREATE", newValue: created, userId });
  return created;
}

export async function updateDialect(
  id: string,
  data: Partial<{ name: string; nameAr: string | null; description: string | null; parentId: string | null; enabled: boolean; sortOrder: number }>,
  userId: string,
) {
  const before = await db.dialectNode.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Dialect not found");
  if (data.parentId) {
    // prevent cycles: walk up from the new parent
    let cursor: string | null = data.parentId;
    while (cursor) {
      if (cursor === id) throw new ApiError(400, "Cannot move a dialect under its own descendant");
      const parent: { parentId: string | null } | null = await db.dialectNode.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }
  const updated = await db.dialectNode.update({ where: { id }, data });
  await recordRevision(db, { entityType: "dialect", entityId: id, kind: "UPDATE", oldValue: before, newValue: updated, userId });
  return updated;
}

/** Merge `fromId` into `intoId`: relink every reference, then delete the source node. */
export async function mergeDialect(fromId: string, intoId: string, userId: string) {
  if (fromId === intoId) throw new ApiError(400, "Cannot merge a dialect into itself");
  const [from, into] = await Promise.all([
    db.dialectNode.findUnique({ where: { id: fromId } }),
    db.dialectNode.findUnique({ where: { id: intoId } }),
  ]);
  if (!from || !into) throw new ApiError(404, "Dialect not found");

  await db.$transaction(async (tx) => {
    await tx.expression.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.sentence.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.pronunciation.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.responseVariant.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.responseTrigger.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.conversation.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.conversationTurn.updateMany({ where: { dialectId: fromId }, data: { dialectId: intoId } });
    await tx.dialectNode.updateMany({ where: { parentId: fromId }, data: { parentId: intoId } });
    await tx.dialectNode.delete({ where: { id: fromId } });
    await recordRevision(tx, {
      entityType: "dialect",
      entityId: fromId,
      kind: "DELETE",
      oldValue: from,
      newValue: { mergedInto: intoId },
      reason: `Merged into ${into.name}`,
      userId,
    });
  });
}

export async function deleteDialect(id: string, userId: string) {
  const before = await db.dialectNode.findUnique({
    where: { id },
    include: { _count: { select: { expressions: true, sentences: true, children: true, conversations: true } } },
  });
  if (!before) throw new ApiError(404, "Dialect not found");
  const c = before._count;
  if (c.expressions || c.sentences || c.children || c.conversations) {
    throw new ApiError(400, "Dialect has linked data. Merge it into another dialect or disable it instead.");
  }
  await db.dialectNode.delete({ where: { id } });
  await recordRevision(db, { entityType: "dialect", entityId: id, kind: "DELETE", oldValue: before, userId });
}
