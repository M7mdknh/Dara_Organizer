import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { loadEnv } from "@/lib/env";
import { getRedisConnection } from "@/lib/redis";
import { JOB_TYPES } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { processImportParse } from "@/worker/processors/importParse";
import { processImportMatch } from "@/worker/processors/importMatch";
import { processGenerateEmbeddings } from "@/worker/processors/generateEmbeddings";
import { processAiEnrich } from "@/worker/processors/aiEnrich";
import { processSemanticAdjudication } from "@/worker/processors/semanticAdjudication";
import { processDatasetExport } from "@/worker/processors/datasetExport";

/**
 * Dedicated background worker process. Run separately from the Next.js app
 * (`npm run worker`) — a Docker restart of the app container must not lose
 * in-flight jobs, since they live durably in Redis (BullMQ) and their
 * progress/results are persisted to Postgres by each processor.
 */

const env = loadEnv();

if (!env.BACKGROUND_JOBS_ENABLED) {
  logger.warn("worker.disabled", { reason: "BACKGROUND_JOBS_ENABLED=false — nothing to do, exiting" });
  process.exit(0);
}

const connection = getRedisConnection();
if (!connection) {
  logger.error("worker.no_redis", { reason: "REDIS_URL not configured" });
  process.exit(1);
}

const PROCESSORS: Record<string, (job: Job) => Promise<unknown>> = {
  [JOB_TYPES.IMPORT_PARSE]: processImportParse,
  [JOB_TYPES.IMPORT_MATCH]: processImportMatch,
  [JOB_TYPES.GENERATE_EMBEDDINGS]: processGenerateEmbeddings,
  [JOB_TYPES.AI_ENRICH]: processAiEnrich,
  [JOB_TYPES.SEMANTIC_ADJUDICATION]: processSemanticAdjudication,
  [JOB_TYPES.DATASET_EXPORT]: processDatasetExport,
};

const workers = Object.entries(PROCESSORS).map(([name, processor]) => {
  const worker = new Worker(
    name,
    async (job) => {
      logger.info("job.start", { queue: name, jobId: job.id, attempt: job.attemptsMade });
      const start = Date.now();
      try {
        const result = await processor(job);
        logger.info("job.complete", { queue: name, jobId: job.id, durationMs: Date.now() - start });
        return result;
      } catch (err) {
        logger.error("job.error", {
          queue: name,
          jobId: job.id,
          attempt: job.attemptsMade,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: name === JOB_TYPES.AI_ENRICH || name === JOB_TYPES.SEMANTIC_ADJUDICATION ? env.AI_JOB_CONCURRENCY : env.WORKER_CONCURRENCY,
    },
  );
  worker.on("failed", (job, err) => {
    logger.error("job.failed_terminal", { queue: name, jobId: job?.id, error: err.message });
  });
  return worker;
});

logger.info("worker.started", { queues: Object.keys(PROCESSORS), concurrency: env.WORKER_CONCURRENCY });

// Periodic heartbeat so external process supervisors / log-based health
// checks can tell the worker is alive and which queues it's watching.
const heartbeat = setInterval(() => {
  logger.info("worker.heartbeat", { queues: Object.keys(PROCESSORS) });
}, 60_000);
heartbeat.unref();

async function shutdown(signal: string) {
  logger.info("worker.shutting_down", { signal });
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
