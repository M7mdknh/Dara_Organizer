import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, parseBody } from "@/lib/api";
import { findMissingEmbeddings, listStaleEmbeddings, type EmbeddingEntityType } from "@/services/ai/embeddings";
import { enqueueOrRun, JOB_TYPES } from "@/lib/queue";
import { ensureEmbedding } from "@/services/ai/embeddings";

const schema = z.object({
  entityType: z.enum(["CONCEPT", "SENTENCE", "EXPRESSION"]),
  mode: z.enum(["missing", "stale", "all"]).default("missing"),
  limit: z.number().int().min(1).max(2000).default(200),
});

/** Admin action: queue (or run inline) embedding generation for missing/stale/all records of a type. */
export const POST = withAuth("ADMIN", async (req) => {
  const { entityType, mode, limit } = await parseBody(req, schema);

  let targets: { entityType: EmbeddingEntityType; entityId: string }[] = [];
  if (mode === "missing" || mode === "all") {
    const missing = await findMissingEmbeddings(entityType, limit);
    targets.push(...missing.map((entityId) => ({ entityType, entityId })));
  }
  if (mode === "stale" || mode === "all") {
    const stale = await listStaleEmbeddings(limit);
    targets.push(...stale.filter((s) => s.entityType === entityType).map((s) => ({ entityType, entityId: s.entityId })));
  }
  targets = targets.slice(0, limit);

  let queued = 0;
  let ranInline = 0;
  for (const t of targets) {
    const outcome = await enqueueOrRun(JOB_TYPES.GENERATE_EMBEDDINGS, t, () => ensureEmbedding(t.entityType, t.entityId));
    if (outcome.mode === "queued") queued++;
    else ranInline++;
  }

  return NextResponse.json({ requested: targets.length, queued, ranInline });
});
