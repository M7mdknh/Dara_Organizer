import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { processImportJob } from "@/domains/imports/service";
import { logger } from "@/lib/logger";

export interface ImportMatchJobData {
  jobId: string;
  userId: string;
}

/**
 * Runs the matching engine over every row of an import job. Delegates to
 * the same domain service used by the synchronous fallback path
 * (src/domains/imports/service.ts) — worker and app share domain logic
 * rather than duplicating it. processImportJob is itself resumable: rows
 * already marked processedAt are skipped, so a retried/duplicated
 * IMPORT_MATCH job (or a worker restart mid-run) picks up where it left off
 * instead of reprocessing or double-counting.
 */
export async function processImportMatch(job: Job<ImportMatchJobData>) {
  const { jobId, userId } = job.data;
  const start = Date.now();
  logger.info("import_match.start", { jobId, bullJobId: job.id, attempt: job.attemptsMade });

  await db.importJob.update({ where: { id: jobId }, data: { jobId: job.id ?? null } });

  try {
    const result = await processImportJob(jobId, userId);
    logger.info("import_match.done", {
      jobId,
      durationMs: Date.now() - start,
      accepted: result.accepted,
      matched: result.matched,
      conflicts: result.conflicts,
      semanticCandidates: result.semanticCandidates,
      errors: result.errors,
    });
    return result;
  } catch (err) {
    logger.error("import_match.failed", { jobId, attempt: job.attemptsMade, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
