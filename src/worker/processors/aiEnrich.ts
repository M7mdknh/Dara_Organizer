import type { Job } from "bullmq";
import { runEnrichment, type EnrichmentType } from "@/services/ai/enrichment";
import { extractLinguisticKnowledge } from "@/domains/linguistics/extraction";
import { logger } from "@/lib/logger";

export interface AiEnrichJobData {
  type: EnrichmentType | "extract_linguistics";
  entityType: "sentence" | "expression";
  entityId: string;
}

export async function processAiEnrich(job: Job<AiEnrichJobData>) {
  const { type, entityType, entityId } = job.data;
  const start = Date.now();
  try {
    // extract_linguistics organizes structured knowledge (concepts,
    // expressions, MSA equivalents, translations) directly, unlike other
    // enrichment types which always route to a single review-only
    // suggestion — see src/domains/linguistics/extraction.ts for why.
    const result =
      type === "extract_linguistics" && entityType === "sentence"
        ? await extractLinguisticKnowledge(entityId)
        : await runEnrichment(type as EnrichmentType, entityType, entityId);
    logger.info("ai_enrich.done", { type, entityType, entityId, durationMs: Date.now() - start, bullJobId: job.id });
    return result;
  } catch (err) {
    logger.error("ai_enrich.failed", { type, entityType, entityId, attempt: job.attemptsMade, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
