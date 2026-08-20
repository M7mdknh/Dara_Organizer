import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision, diffFields } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>("VIEWER", async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  const item = await db.utteranceGroup.findUnique({
    where: { id },
    include: {
      intent: true,
      sentences: {
        include: { dialect: true, language: true, pronunciations: true, source: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!item) throw new ApiError(404, "Utterance group not found");
  return NextResponse.json({ item });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  meaning: z.string().nullish(),
  intentId: z.string().nullish(),
  notes: z.string().nullish(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const before = await db.utteranceGroup.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Utterance group not found");
  const updated = await db.utteranceGroup.update({ where: { id }, data });
  const { oldDiff, newDiff } = diffFields(before as never, updated as never);
  if (Object.keys(newDiff).length) {
    await recordRevision(db, { entityType: "utteranceGroup", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id });
  }
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.utteranceGroup.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Utterance group not found");
  await db.utteranceGroup.delete({ where: { id } });
  await recordRevision(db, { entityType: "utteranceGroup", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  return NextResponse.json({ ok: true });
});
