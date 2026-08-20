import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { recordRevision } from "@/services/revisions";

const pronunciationSchema = z.object({
  expressionId: z.string().nullish(),
  sentenceId: z.string().nullish(),
  dialectId: z.string().nullish(),
  arabicPhonetic: z.string().nullish(),
  diacritized: z.string().nullish(),
  ipa: z.string().nullish(),
  notes: z.string().nullish(),
  isVariant: z.boolean().optional(),
  variantLabel: z.string().nullish(),
});

export const POST = withAuth("EDITOR", async (req, user) => {
  const data = await parseBody(req, pronunciationSchema);
  if (!data.expressionId && !data.sentenceId) {
    throw new ApiError(400, "Pronunciation must attach to an expression or a sentence");
  }
  const created = await db.pronunciation.create({ data });
  await recordRevision(db, { entityType: "pronunciation", entityId: created.id, kind: "CREATE", newValue: created, userId: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
});
