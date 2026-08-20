import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision, diffFields } from "@/services/revisions";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  dialectId: z.string().nullish(),
  arabicPhonetic: z.string().nullish(),
  diacritized: z.string().nullish(),
  ipa: z.string().nullish(),
  notes: z.string().nullish(),
  isVariant: z.boolean().optional(),
  variantLabel: z.string().nullish(),
  verification: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]).optional(),
});

export const PATCH = withAuth<Ctx>("EDITOR", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const data = await parseBody(req, patchSchema);
  const before = await db.pronunciation.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Pronunciation not found");
  const updated = await db.pronunciation.update({ where: { id }, data });
  const { oldDiff, newDiff } = diffFields(before as never, updated as never);
  if (Object.keys(newDiff).length) {
    await recordRevision(db, { entityType: "pronunciation", entityId: id, kind: "UPDATE", oldValue: oldDiff, newValue: newDiff, userId: user.id });
  }
  return NextResponse.json({ item: updated });
});

export const DELETE = withAuth<Ctx>("EDITOR", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const before = await db.pronunciation.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Pronunciation not found");
  await db.pronunciation.delete({ where: { id } });
  await recordRevision(db, { entityType: "pronunciation", entityId: id, kind: "DELETE", oldValue: before, userId: user.id });
  return NextResponse.json({ ok: true });
});
