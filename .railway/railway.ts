import { defineRailway, github, project, service } from "railway/iac";

/**
 * Declarative Railway infrastructure for the Dara Organizer (Arabic Dialect
 * Data Platform). Two services deploy from the same GitHub repo with
 * different start commands, sharing the same external managed services:
 *
 *   web    -> Next.js app (npm run start), public HTTP + healthcheck
 *   worker -> background job processor (npm run worker), no public port
 *
 * PostgreSQL (+pgvector), Redis, and S3-compatible storage are NOT
 * provisioned here — they are external managed services (Supabase,
 * Upstash, Supabase Storage) per the project's production architecture.
 *
 * Secret values are intentionally NEVER hardcoded in this file. They are
 * read from the local shell environment (via `process.env.X`) at the
 * moment `railway config apply` runs, and only the resulting values are
 * sent to Railway's API — this file itself contains no secret bytes and is
 * safe to commit. Run `set -a; source .env; set +a` (or otherwise export
 * the required variables) before `railway config apply`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — export it before running railway config apply`);
  return value;
}

export default defineRailway(() => {
  const repoSource = github("M7mdknh/Dara_Organizer", { branch: "main" });

  // Shared, non-secret production configuration for both services.
  const sharedEnv = {
    NODE_ENV: "production",
    SESSION_SECRET: required("SESSION_SECRET"),

    DATABASE_URL: required("DATABASE_URL"),

    AI_PROVIDER: process.env.AI_PROVIDER || "openai",
    OPENAI_API_KEY: required("OPENAI_API_KEY"),
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.6-terra",
    OPENAI_ADJUDICATION_MODEL: process.env.OPENAI_ADJUDICATION_MODEL || "gpt-5.6-sol",
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
    OPENAI_EMBEDDING_DIMENSIONS: process.env.OPENAI_EMBEDDING_DIMENSIONS || "3072",

    SEMANTIC_MATCHING_ENABLED: process.env.SEMANTIC_MATCHING_ENABLED || "true",
    SEMANTIC_TOP_K: process.env.SEMANTIC_TOP_K || "10",
    SEMANTIC_VECTOR_MIN_SIMILARITY: process.env.SEMANTIC_VECTOR_MIN_SIMILARITY || "0.65",
    SEMANTIC_AUTO_APPROVE: "false",
    SEMANTIC_ADJUDICATION_ENABLED: process.env.SEMANTIC_ADJUDICATION_ENABLED || "true",

    REDIS_URL: required("REDIS_URL"),
    BACKGROUND_JOBS_ENABLED: "true",
    WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY || "4",
    IMPORT_CHUNK_SIZE: process.env.IMPORT_CHUNK_SIZE || "500",
    AI_JOB_CONCURRENCY: process.env.AI_JOB_CONCURRENCY || "2",
    EMBEDDING_BATCH_SIZE: process.env.EMBEDDING_BATCH_SIZE || "100",

    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: required("S3_ENDPOINT"),
    S3_REGION: required("S3_REGION"),
    S3_BUCKET: required("S3_BUCKET"),
    S3_ACCESS_KEY_ID: required("S3_ACCESS_KEY_ID"),
    S3_SECRET_ACCESS_KEY: required("S3_SECRET_ACCESS_KEY"),
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE || "true",

    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  };

  // Railway's config-as-code build/start command fields go through the
  // Nixpacks builder, which does not reliably persist a custom
  // multi-command build (e.g. copying public/ and .next/static into
  // .next/standalone/ after `next build`, required by next.config.ts's
  // output:"standalone") between its build and run phases. Rather than
  // fight that, each service builds from its own self-contained Dockerfile
  // via RAILWAY_DOCKERFILE_PATH — the exact same images already verified
  // locally (Dockerfile.web / Dockerfile.worker; the shared multi-stage
  // `Dockerfile` remains the source of truth for local docker-compose,
  // which supports build.target directly).
  const web = service("web", {
    source: repoSource,
    healthcheck: "/api/health",
    env: {
      ...sharedEnv,
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.web",
      // Set to the real Railway public domain after the first deploy
      // (see README "Railway deployment" — `railway domain` then update
      // this and redeploy, or set APP_URL directly via `railway variable set`).
      APP_URL: process.env.RAILWAY_WEB_APP_URL || "https://REPLACE_WITH_RAILWAY_DOMAIN",
    },
  });

  const worker = service("worker", {
    source: repoSource,
    env: {
      ...sharedEnv,
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.worker",
    },
  });

  return project("dara-organizer", {
    resources: [web, worker],
  });
});
