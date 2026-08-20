import type { Job } from "bullmq";
import { runEnrichment, type EnrichmentType } from "@/services/ai/enrichment";
import { logger } from "@/lib/logger";

export interface AiEnrichJobData {
  type: EnrichmentType;
  entityType: "sentence" | "expression";
  entityId: string;
}

export async function processAiEnrich(job: Job<AiEnrichJobData>) {
  const { type, entityType, entityId } = job.data;
  const start = Date.now();
  try {
    const result = await runEnrichment(type, entityType, entityId);
    logger.info("ai_enrich.done", { type, entityType, entityId, durationMs: Date.now() - start, bullJobId: job.id });
    return result;
  } catch (err) {
    logger.error("ai_enrich.failed", { type, entityType, entityId, attempt: job.attemptsMade, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
