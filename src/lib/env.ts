import { z } from "zod";

/**
 * Typed environment configuration, validated once at process startup
 * (see instrumentation.ts). This is the single source of truth for config —
 * do not read process.env ad hoc elsewhere for anything listed here.
 *
 * Server-only: this module must never be imported from client components.
 * Nothing here is exposed to the browser (no NEXT_PUBLIC_ prefixes used).
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().default("http://localhost:3000"),

    // Sessions
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

    // Database
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_DATABASE_URL: z.string().optional(),

    // AI provider
    AI_PROVIDER: z.enum(["none", "mock", "anthropic", "openai"]).default("none"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-sonnet-5"),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
    OPENAI_ADJUDICATION_MODEL: z.string().default("gpt-5.6-sol"),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-large"),
    OPENAI_EMBEDDING_DIMENSIONS: num(3072),
    OPENAI_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
    OPENAI_TIMEOUT_MS: num(120_000),
    OPENAI_MAX_RETRIES: num(3),

    // Semantic matching
    SEMANTIC_MATCHING_ENABLED: bool(false),
    SEMANTIC_TOP_K: num(10),
    // 0.55, not 0.65: measured against real text-embedding-3-large output —
    // a genuine dialect-word/concept match (e.g. Najdi "الحين" against the
    // existing TIME_NOW concept, whose representation text includes "الحين"
    // verbatim) scored 0.589 cosine similarity. At 0.65 that true match is
    // silently excluded from retrieval, so the LLM judgment stage never
    // even sees it and a duplicate concept gets created instead of reused.
    // The LLM judgment step (not the threshold) is the actual precision
    // gate — this only widens what gets shown to it.
    SEMANTIC_VECTOR_MIN_SIMILARITY: num(0.55),
    SEMANTIC_AUTO_APPROVE: bool(false),
    SEMANTIC_ADJUDICATION_ENABLED: bool(true),

    // Redis / background jobs
    REDIS_URL: z.string().optional(),
    BACKGROUND_JOBS_ENABLED: bool(false),
    WORKER_CONCURRENCY: num(4),
    IMPORT_CHUNK_SIZE: num(500),
    AI_JOB_CONCURRENCY: num(2),
    EMBEDDING_BATCH_SIZE: num(100),

    // Object storage
    STORAGE_PROVIDER: z.enum(["s3", "local"]).default("local"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool(false),
    S3_PUBLIC_URL: z.string().optional(),

    // Uploads
    MAX_UPLOAD_SIZE_MB: num(250),
    ALLOWED_IMPORT_TYPES: z.string().default("xlsx,csv,txt"),
    MEDIA_UPLOADS_ENABLED: bool(false),

    // Dataset export / import storage prefixes
    EXPORT_STORAGE_PREFIX: z.string().default("exports/"),
    IMPORT_STORAGE_PREFIX: z.string().default("imports/"),

    // Logging
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      if (val.SESSION_SECRET === "insecure_dev_secret_min_32_chars_long!!") {
        ctx.addIssue({ code: "custom", message: "SESSION_SECRET must be changed in production" });
      }
      if (val.STORAGE_PROVIDER === "s3" && (!val.S3_BUCKET || !val.S3_ACCESS_KEY_ID || !val.S3_SECRET_ACCESS_KEY)) {
        ctx.addIssue({ code: "custom", message: "S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are required in production when STORAGE_PROVIDER=s3" });
      }
      if (val.BACKGROUND_JOBS_ENABLED && !val.REDIS_URL) {
        ctx.addIssue({ code: "custom", message: "REDIS_URL is required when BACKGROUND_JOBS_ENABLED=true" });
      }
    }
    if (val.AI_PROVIDER === "openai" && !val.OPENAI_API_KEY) {
      ctx.addIssue({ code: "custom", message: "OPENAI_API_KEY is required when AI_PROVIDER=openai" });
    }
    if (val.AI_PROVIDER === "anthropic" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: "custom", message: "ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic" });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parses and validates process.env. Throws with a clear message on failure. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${message}`);
  }
  cached = parsed.data;
  return cached;
}

/** Convenience accessor. Validates lazily on first access if not already validated. */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});
