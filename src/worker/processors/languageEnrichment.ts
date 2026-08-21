import type { Job } from "bullmq";
import { enrichConceptsForLanguage } from "@/domains/languages/enrichment";
import { logger } from "@/lib/logger";

export interface LanguageEnrichmentJobData {
  languageId: string;
  onlyVerified?: boolean;
}

export async function processLanguageEnrichment(job: Job<LanguageEnrichmentJobData>) {
  const { languageId, onlyVerified } = job.data;
  const start = Date.now();
  try {
    const result = await enrichConceptsForLanguage(languageId, { onlyVerified });
    logger.info("language_enrichment.done", { durationMs: Date.now() - start, ...result });
    return result;
  } catch (err) {
    logger.error("language_enrichment.failed", { languageId, attempt: job.attemptsMade, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
