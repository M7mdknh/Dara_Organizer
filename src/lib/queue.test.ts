import { describe, it, expect, beforeAll } from "vitest";

// queue.ts transitively requires env validation (DATABASE_URL/SESSION_SECRET)
// even though this test never touches the database — set minimal fixtures
// before import so loadEnv() doesn't throw.
beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://localhost/test";
  process.env.SESSION_SECRET ??= "x".repeat(32);
});

describe("JOB_TYPES", () => {
  it("declares every job type required by the background processing architecture", async () => {
    const { JOB_TYPES } = await import("./queue");
    expect(Object.values(JOB_TYPES).sort()).toEqual(
      ["AI_ENRICH", "DATASET_EXPORT", "GENERATE_EMBEDDINGS", "IMPORT_MATCH", "IMPORT_PARSE", "SEMANTIC_ADJUDICATION", "LANGUAGE_ENRICHMENT"].sort(),
    );
  });
});

describe("backgroundJobsAvailable", () => {
  it("is false when BACKGROUND_JOBS_ENABLED is unset (safe default)", async () => {
    delete process.env.BACKGROUND_JOBS_ENABLED;
    delete process.env.REDIS_URL;
    const { backgroundJobsAvailable } = await import("./queue");
    expect(backgroundJobsAvailable()).toBe(false);
  });
});

describe("enqueueOrRun", () => {
  it("falls back to running inline when background jobs are unavailable", async () => {
    delete process.env.BACKGROUND_JOBS_ENABLED;
    const { enqueueOrRun, JOB_TYPES } = await import("./queue");
    let ran = false;
    const outcome = await enqueueOrRun(JOB_TYPES.AI_ENRICH, { foo: "bar" }, async () => {
      ran = true;
      return { ok: true };
    });
    expect(ran).toBe(true);
    expect(outcome.mode).toBe("inline");
    if (outcome.mode === "inline") expect(outcome.result).toEqual({ ok: true });
  });

  it("never calls the fallback twice for a single invocation", async () => {
    delete process.env.BACKGROUND_JOBS_ENABLED;
    const { enqueueOrRun, JOB_TYPES } = await import("./queue");
    let calls = 0;
    await enqueueOrRun(JOB_TYPES.GENERATE_EMBEDDINGS, {}, async () => {
      calls++;
      return null;
    });
    expect(calls).toBe(1);
  });
});
