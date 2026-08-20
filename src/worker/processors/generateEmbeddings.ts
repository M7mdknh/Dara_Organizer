import type { Job } from "bullmq";
import { ensureEmbedding, type EmbeddingEntityType } from "@/services/ai/embeddings";
import { logger } from "@/lib/logger";

export interface GenerateEmbeddingsJobData {
  entityType: EmbeddingEntityType;
  entityId: string;
}

export async function processGenerateEmbeddings(job: Job<GenerateEmbeddingsJobData>) {
  const { entityType, entityId } = job.data;
  const start = Date.now();
  const outcome = await ensureEmbedding(entityType, entityId);
  logger.info("generate_embeddings.done", { entityType, entityId, outcome, durationMs: Date.now() - start, bullJobId: job.id });
  return { outcome };
}
