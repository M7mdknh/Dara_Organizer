import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeArabic } from "@/services/normalization";
import { recordRevision, diffFields } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.conversation.findUnique({
    where: { id },
    include: {
      dialect: true,
      situation: true,
      source: true,
      categories: { include: { category: true } },
      turns: {
        orderBy: { orderIndex: "asc" },
        include: { dialect: true, intent: true, function: true, sentence: true },
      },
    },
  });
  if (!item) throw new ApiError(404, "Conversation not found");
  return NextResponse.json({ item });
});

const turnSchema = z.object({
  id: z.string().optional(),
  speaker: z.string().min(1),
  textOriginal: z.string().min(1),
  dialectId: z.string().nullish(),
  intentId: z.string().nullish(),
  functionId: z.string().nullish(),
  notes: z.string().nullish(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  dialectId: z.string().nullish(),
  situationId: z.string().nullish(),
  quality: z.enum(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"]).optional(),
  verification: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]).optional(),
  training: z.enum(["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  turns: z.array(turnSchema).optional(), // full replacement of turn list, order = array order
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  const before = await db.conversation.findUnique({ where: { id }, include: { turns: true } });
  if (!before) throw new ApiError(404, "Conversation not found");

  await db.$transaction(async (tx) => {
    const { categoryIds, turns, ...fields } = body;
    const updated = await tx.conversation.update({ where: { id }, data: fields });
    if (categoryIds) {
      await tx.conversationCategory.deleteMany({ where: { conversationId: id } });
      if (categoryIds.length) {
        await tx.conversationCategory.createMany({
          data: categoryIds.map((categoryId) => ({ conversationId: id, categoryId })),
        });
      }
    }
    if (turns) {
      await tx.conversationTurn.deleteMany({ where: { conversationId: id } });
      await tx.conversationTurn.createMany({
        data: turns.map((t, i) => ({
          conversationId: id,
          orderIndex: i,
          speaker: t.speaker,
          textOriginal: t.textOriginal,
          textNormalized: normalizeArabic(t.textOriginal),
          dialectId: t.dialectId ?? null,
          intentId: t.intentId ?? null,
          functionId: t.functionId ?? null,
          notes: t.notes ?? null,
        })),
      });
    }
    const { oldDiff, newDiff } = diffFields(
      { ...before, turns: before.turns.map((t) => ({ speaker: t.speaker, text: t.textOriginal })) } as never,
      { ...updated, turns: turns?.map((t) => ({ speaker: t.speaker, text: t.textOriginal })) ?? before.turns.map((t) => ({ speaker: t.speaker, text: t.textOriginal })) } as never,
    );
    if (Object.keys(newDiff).length) {
      await recordRevision(tx, { entityType: "conversation", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id });
    }
  });

  const item = await db.conversation.findUnique({
    where: { id },
    include: { turns: { orderBy: { orderIndex: "asc" } }, categories: { include: { category: true } } },
  });
  return NextResponse.json({ item });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.conversation.findUnique({ where: { id }, include: { turns: true } });
  if (!before) throw new ApiError(404, "Conversation not found");
  await db.$transaction(async (tx) => {
    await tx.conversation.delete({ where: { id } });
    await recordRevision(tx, { entityType: "conversation", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  });
  return NextResponse.json({ ok: true });
});
