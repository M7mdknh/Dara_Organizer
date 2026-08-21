import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { enqueueOrRun, JOB_TYPES } from "@/lib/queue";
import { enrichConceptsForLanguage } from "@/domains/languages/enrichment";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ onlyVerified: z.boolean().optional() });

/** Backfills translations for existing concepts into this language — see src/domains/languages/enrichment.ts. */
export const POST = withAuth<Ctx>("ADMIN", async (req, _user, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  const language = await db.language.findUnique({ where: { id } });
  if (!language) throw new ApiError(404, "Language not found");

  const outcome = await enqueueOrRun(
    JOB_TYPES.LANGUAGE_ENRICHMENT,
    { languageId: id, onlyVerified: body.onlyVerified ?? false },
    () => enrichConceptsForLanguage(id, { onlyVerified: body.onlyVerified ?? false }),
  );

  if (outcome.mode === "queued") return NextResponse.json({ queued: true, jobId: outcome.jobId });
  return NextResponse.json({ queued: false, result: outcome.result });
});
