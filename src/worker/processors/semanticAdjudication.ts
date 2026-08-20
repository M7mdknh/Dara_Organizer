import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { judgeExpressionAgainstConcepts } from "@/services/matching/semantic";
import { logger } from "@/lib/logger";

export interface SemanticAdjudicationJobData {
  reviewItemId: string;
  text: string;
  dialectName: string | null;
  sourceSentence: string | null;
}

/**
 * Standalone re-run of the semantic judgment cascade for a specific review
 * item — used by the "Re-run AI judgment" admin/reviewer action rather than
 * on the hot import path (where judgment runs inline for latency reasons;
 * see src/services/matching/semantic.ts). Updates the review item's stored
 * evidence in place so reviewers see the refreshed judgment.
 */
export async function processSemanticAdjudication(job: Job<SemanticAdjudicationJobData>) {
  const { reviewItemId, text, dialectName, sourceSentence } = job.data;
  const start = Date.now();
  const evidence = await judgeExpressionAgainstConcepts({ text, dialectName, sourceSentence });

  const item = await db.reviewItem.findUnique({ where: { id: reviewItemId } });
  if (item) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    await db.reviewItem.update({
      where: { id: reviewItemId },
      data: { payload: { ...payload, semanticEvidence: evidence } as unknown as Prisma.InputJsonValue },
    });
  }
  logger.info("semantic_adjudication.done", { reviewItemId, durationMs: Date.now() - start, bullJobId: job.id });
  return { evidence };
}
