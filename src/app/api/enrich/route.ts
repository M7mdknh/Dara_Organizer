import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { runEnrichment } from "@/services/ai/enrichment";
import { enqueueOrRun, JOB_TYPES } from "@/lib/queue";

const schema = z.object({
  type: z.enum(["translate", "classify", "detect_dialect", "suggest_pronunciation", "suggest_responses"]),
  entityType: z.enum(["sentence", "expression"]),
  entityIds: z.array(z.string()).min(1).max(50),
});

export const POST = withAuth("EDITOR", async (req) => {
  const { type, entityType, entityIds } = await parseBody(req, schema);
  const results: { entityId: string; jobId?: string; queued?: boolean; error?: string }[] = [];
  for (const entityId of entityIds) {
    try {
      const outcome = await enqueueOrRun(JOB_TYPES.AI_ENRICH, { type, entityType, entityId }, () =>
        runEnrichment(type, entityType, entityId),
      );
      if (outcome.mode === "queued") results.push({ entityId, jobId: outcome.jobId, queued: true });
      else results.push({ entityId, jobId: outcome.result.jobId });
    } catch (err) {
      results.push({ entityId, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  if (results.every((r) => r.error)) {
    throw new ApiError(400, results[0].error ?? "Enrichment failed");
  }
  return NextResponse.json({ results });
});

export const GET = withAuth("VIEWER", async (req) => {
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const items = await db.enrichmentJob.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
});
