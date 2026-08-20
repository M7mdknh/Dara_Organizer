import { enqueueOrRun, JOB_TYPES } from "@/lib/queue";
import { ensureEmbedding, type EmbeddingEntityType } from "@/services/ai/embeddings";

/**
 * Call after creating/updating a Concept or Sentence. Queues a
 * GENERATE_EMBEDDINGS job when background jobs are available, otherwise
 * runs inline. ensureEmbedding itself is the source of truth for whether
 * work is actually needed (hash-based staleness check) — this is just the
 * dispatch layer, so calling it on every save is cheap and safe.
 */
export async function triggerEmbedding(entityType: EmbeddingEntityType, entityId: string): Promise<void> {
  await enqueueOrRun(JOB_TYPES.GENERATE_EMBEDDINGS, { entityType, entityId }, () => ensureEmbedding(entityType, entityId)).catch(
    () => undefined, // embedding generation must never fail the user-facing create/update request
  );
}
