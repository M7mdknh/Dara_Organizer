import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision, diffFields } from "@/services/revisions";
import { triggerEmbedding } from "@/services/ai/embedTrigger";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.concept.findUnique({
    where: { id },
    include: {
      source: true,
      expressions: {
        include: {
          expression: {
            include: {
              dialect: true,
              language: true,
              register: true,
              pronunciations: true,
              relationsFrom: { include: { to: { include: { dialect: true } } } },
            },
          },
        },
      },
      sentences: {
        include: { sentence: { include: { dialect: true, language: true, utteranceGroup: true } } },
        take: 100,
      },
    },
  });
  if (!item) throw new ApiError(404, "Concept not found");
  return NextResponse.json({ item });
});

const patchSchema = z.object({
  key: z.string().min(1).regex(/^[A-Z0-9_]+$/).optional(),
  gloss: z.string().min(1).optional(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  reason: z.string().optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const { reason, ...data } = await parseBody(req, patchSchema);
  const before = await db.concept.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Concept not found");
  const updated = await db.concept.update({ where: { id }, data });
  const { oldDiff, newDiff } = diffFields(before as never, updated as never);
  if (Object.keys(newDiff).length) {
    await recordRevision(db, { entityType: "concept", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id, reason });
    void triggerEmbedding("CONCEPT", id);
  }
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.concept.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Concept not found");
  await db.$transaction(async (tx) => {
    await tx.concept.delete({ where: { id } });
    await recordRevision(tx, { entityType: "concept", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  });
  return NextResponse.json({ ok: true });
});
