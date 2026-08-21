import { Queue, type JobsOptions } from "bullmq";
import { env } from "@/lib/env";
import { getRedisConnection } from "@/lib/redis";

/**
 * Durable job queue. Large imports and AI enrichment must not depend on an
 * HTTP request staying open — when BACKGROUND_JOBS_ENABLED=true and Redis
 * is reachable, work is queued and processed by the worker process
 * (src/worker/index.ts). Otherwise it falls back to running inline in the
 * request handler, which keeps local dev/tests working without Redis.
 */

export const JOB_TYPES = {
  IMPORT_PARSE: "IMPORT_PARSE",
  IMPORT_MATCH: "IMPORT_MATCH",
  GENERATE_EMBEDDINGS: "GENERATE_EMBEDDINGS",
  AI_ENRICH: "AI_ENRICH",
  SEMANTIC_ADJUDICATION: "SEMANTIC_ADJUDICATION",
  DATASET_EXPORT: "DATASET_EXPORT",
  LANGUAGE_ENRICHMENT: "LANGUAGE_ENRICHMENT",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const queues = new Map<JobType, Queue>();

export function backgroundJobsAvailable(): boolean {
  return env.BACKGROUND_JOBS_ENABLED && !!getRedisConnection();
}

export function getQueue(type: JobType): Queue {
  let q = queues.get(type);
  if (!q) {
    const connection = getRedisConnection();
    if (!connection) throw new Error("Redis is not configured (REDIS_URL missing)");
    q = new Queue(type, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(type, q);
  }
  return q;
}

/**
 * Enqueues a job when background processing is available, otherwise runs
 * `fallback` inline and resolves once it completes. Callers get the same
 * "it's been handled" contract either way; only the durability/latency
 * characteristics differ.
 */
export async function enqueueOrRun<T>(
  type: JobType,
  data: Record<string, unknown>,
  fallback: () => Promise<T>,
): Promise<{ mode: "queued"; jobId: string } | { mode: "inline"; result: T }> {
  if (backgroundJobsAvailable()) {
    const job = await getQueue(type).add(type, data);
    return { mode: "queued", jobId: job.id ?? "" };
  }
  const result = await fallback();
  return { mode: "inline", result };
}
