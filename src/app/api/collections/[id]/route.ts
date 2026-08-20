import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.collection.findUnique({
    where: { id },
    include: { items: { orderBy: { addedAt: "desc" }, take: 500 } },
  });
  if (!item) throw new ApiError(404, "Collection not found");

  // hydrate item summaries by type
  const byType = new Map<string, string[]>();
  for (const ci of item.items) {
    if (!byType.has(ci.entityType)) byType.set(ci.entityType, []);
    byType.get(ci.entityType)!.push(ci.entityId);
  }
  const [sentences, expressions, conversations, concepts] = await Promise.all([
    byType.has("sentence")
      ? db.sentence.findMany({ where: { id: { in: byType.get("sentence")! } }, include: { dialect: true, language: true } })
      : [],
    byType.has("expression")
      ? db.expression.findMany({ where: { id: { in: byType.get("expression")! } }, include: { dialect: true, language: true } })
      : [],
    byType.has("conversation") ? db.conversation.findMany({ where: { id: { in: byType.get("conversation")! } } }) : [],
    byType.has("concept") ? db.concept.findMany({ where: { id: { in: byType.get("concept")! } } }) : [],
  ]);
  return NextResponse.json({ item, entities: { sentences, expressions, conversations, concepts } });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  add: z.array(z.object({ entityType: z.string(), entityId: z.string() })).optional(),
  remove: z.array(z.object({ entityType: z.string(), entityId: z.string() })).optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, _user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  const { add, remove, ...fields } = body;
  await db.$transaction(async (tx) => {
    if (Object.keys(fields).length) await tx.collection.update({ where: { id }, data: fields });
    if (add?.length) {
      await tx.collectionItem.createMany({
        data: add.map((a) => ({ collectionId: id, entityType: a.entityType, entityId: a.entityId })),
        skipDuplicates: true,
      });
    }
    if (remove?.length) {
      for (const r of remove) {
        await tx.collectionItem.deleteMany({
          where: { collectionId: id, entityType: r.entityType, entityId: r.entityId },
        });
      }
    }
  });
  const item = await db.collection.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  return NextResponse.json({ item });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  await db.collection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
