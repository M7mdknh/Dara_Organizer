import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";
import { updateSentence, sentenceInputSchema } from "@/domains/sentences/service";
import { triggerEmbedding } from "@/services/ai/embedTrigger";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.sentence.findUnique({
    where: { id },
    include: {
      dialect: true,
      language: true,
      intent: true,
      situation: true,
      register: true,
      function: true,
      source: true,
      utteranceGroup: {
        include: {
          sentences: { where: { id: { not: id }, status: "ACTIVE" }, include: { dialect: true, language: true } },
        },
      },
      concepts: { include: { concept: true } },
      expressions: { include: { expression: { include: { dialect: true } } } },
      categories: { include: { category: true } },
      topics: { include: { topic: true } },
      pronunciations: { include: { dialect: true } },
      conversationTurns: { include: { conversation: true } },
    },
  });
  if (!item) throw new ApiError(404, "Sentence not found");
  return NextResponse.json({ item });
});

const patchSchema = sentenceInputSchema.partial().extend({
  verification: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]).optional(),
  status: z.enum(["ACTIVE", "REJECTED"]).optional(),
  rejectionReason: z
    .enum(["UNNATURAL", "TOO_FORMAL", "SOUNDS_MSA", "WRONG_DIALECT", "WRONG_CONTEXT", "OUTDATED", "INCORRECT", "POOR_TRANSLATION", "OTHER"])
    .nullish(),
  rejectionNote: z.string().nullish(),
  reason: z.string().optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const { reason, verification, ...data } = await parseBody(req, patchSchema);
  const extra: Record<string, unknown> = {};
  if (verification) {
    extra.verification = verification;
    extra.verifiedById = verification === "VERIFIED" ? user.id : null;
    extra.verifiedAt = verification === "VERIFIED" ? new Date() : null;
  }
  const updated = await updateSentence(id, { ...data, ...extra } as never, user.id, reason);
  if (data.textOriginal || data.meaning !== undefined) void triggerEmbedding("SENTENCE", id);
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.sentence.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Sentence not found");
  await db.$transaction(async (tx) => {
    await tx.sentence.delete({ where: { id } });
    await recordRevision(tx, { entityType: "sentence", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  });
  return NextResponse.json({ ok: true });
});
