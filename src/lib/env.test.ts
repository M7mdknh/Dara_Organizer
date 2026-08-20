import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * src/lib/env.ts caches its parsed result in a module-level variable and
 * reads process.env at import time, so each test resets the module
 * registry and mutates process.env before a fresh dynamic import. This
 * exercises the real validation logic rather than a duplicated copy of it.
 */

const BASE_ENV = {
  SESSION_SECRET: "x".repeat(32),
  DATABASE_URL: "postgresql://localhost/db",
};

async function freshLoadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const original = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key in BASE_ENV || key in overrides || key.startsWith("SEMANTIC_") || key.startsWith("OPENAI_") || key.startsWith("S3_") || key === "AI_PROVIDER" || key === "ANTHROPIC_API_KEY" || key === "NODE_ENV" || key === "STORAGE_PROVIDER" || key === "BACKGROUND_JOBS_ENABLED" || key === "REDIS_URL") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, BASE_ENV, overrides);
  try {
    const mod = await import("./env");
    return mod.loadEnv();
  } finally {
    process.env = original;
  }
}

describe("loadEnv", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("accepts a minimal valid development config", async () => {
    const env = await freshLoadEnv({});
    expect(env.AI_PROVIDER).toBe("none");
    expect(env.SEMANTIC_MATCHING_ENABLED).toBe(false);
  });

  it("rejects a session secret shorter than 32 characters", async () => {
    await expect(freshLoadEnv({ SESSION_SECRET: "too-short" })).rejects.toThrow(/SESSION_SECRET/);
  });

  it("requires OPENAI_API_KEY when AI_PROVIDER=openai", async () => {
    await expect(freshLoadEnv({ AI_PROVIDER: "openai" })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("accepts AI_PROVIDER=openai when the key is present", async () => {
    const env = await freshLoadEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" });
    expect(env.AI_PROVIDER).toBe("openai");
  });

  it("requires S3 credentials in production when STORAGE_PROVIDER=s3", async () => {
    await expect(freshLoadEnv({ NODE_ENV: "production", STORAGE_PROVIDER: "s3" })).rejects.toThrow();
  });

  it("does not require S3 credentials outside production", async () => {
    const env = await freshLoadEnv({ NODE_ENV: "development", STORAGE_PROVIDER: "s3" });
    expect(env.STORAGE_PROVIDER).toBe("s3");
  });

  it("requires REDIS_URL in production when BACKGROUND_JOBS_ENABLED=true", async () => {
    await expect(freshLoadEnv({ NODE_ENV: "production", BACKGROUND_JOBS_ENABLED: "true" })).rejects.toThrow(/REDIS_URL/);
  });

  it("parses boolean-ish env strings correctly", async () => {
    const env = await freshLoadEnv({ SEMANTIC_MATCHING_ENABLED: "true" });
    expect(env.SEMANTIC_MATCHING_ENABLED).toBe(true);
  });

  it("falls back to documented numeric defaults when unset", async () => {
    const env = await freshLoadEnv({});
    expect(env.SEMANTIC_TOP_K).toBe(10);
    expect(env.OPENAI_EMBEDDING_DIMENSIONS).toBe(3072);
  });

  it("rejects an unknown AI_PROVIDER value", async () => {
    await expect(freshLoadEnv({ AI_PROVIDER: "cohere" })).rejects.toThrow();
  });
});
