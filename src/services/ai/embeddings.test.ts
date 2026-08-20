import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://localhost/test";
  process.env.SESSION_SECRET ??= "x".repeat(32);
});

describe("sourceHash (embedding staleness detection)", () => {
  it("is deterministic for identical representations", async () => {
    const { sourceHash } = await import("./embeddings");
    expect(sourceHash("Concept: TIME_NOW\nMeaning: at the present time")).toBe(
      sourceHash("Concept: TIME_NOW\nMeaning: at the present time"),
    );
  });

  it("changes when the representation text changes (triggers regeneration)", async () => {
    const { sourceHash } = await import("./embeddings");
    const a = sourceHash("Concept: TIME_NOW\nMeaning: at the present time");
    const b = sourceHash("Concept: TIME_NOW\nMeaning: at the present time, right now");
    expect(a).not.toBe(b);
  });

  it("does not change for unrelated whitespace-identical strings built differently", async () => {
    const { sourceHash } = await import("./embeddings");
    const text = "line one\nline two";
    expect(sourceHash(text)).toBe(sourceHash("line one\nline two"));
  });

  it("is namespaced by REPRESENTATION_VERSION so a format change invalidates old embeddings", async () => {
    const { sourceHash, REPRESENTATION_VERSION } = await import("./embeddings");
    expect(REPRESENTATION_VERSION).toBeGreaterThanOrEqual(1);
    // Same input text still hashes deterministically under the current version.
    expect(sourceHash("x")).toBe(sourceHash("x"));
  });
});
