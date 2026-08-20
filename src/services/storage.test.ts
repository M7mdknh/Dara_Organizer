import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://localhost/test";
  process.env.SESSION_SECRET ??= "x".repeat(32);
});

describe("sha256", () => {
  it("is deterministic for identical content", async () => {
    const { sha256 } = await import("./storage");
    const a = sha256(Buffer.from("hello world"));
    const b = sha256(Buffer.from("hello world"));
    expect(a).toBe(b);
  });

  it("differs for different content (duplicate-upload detection)", async () => {
    const { sha256 } = await import("./storage");
    const a = sha256(Buffer.from("file A content"));
    const b = sha256(Buffer.from("file B content"));
    expect(a).not.toBe(b);
  });

  it("produces a 64-character hex digest", async () => {
    const { sha256 } = await import("./storage");
    const digest = sha256(Buffer.from("x"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("importObjectKey", () => {
  it("preserves the original file extension under the source id", async () => {
    const { importObjectKey } = await import("./storage");
    expect(importObjectKey("src_123", "najdi_sentences.xlsx")).toBe("imports/src_123/original.xlsx");
  });

  it("handles files with no extension", async () => {
    const { importObjectKey } = await import("./storage");
    expect(importObjectKey("src_123", "data")).toBe("imports/src_123/original");
  });

  it("is stable for the same inputs (immutability — never a new key for the same source)", async () => {
    const { importObjectKey } = await import("./storage");
    const a = importObjectKey("src_abc", "file.csv");
    const b = importObjectKey("src_abc", "file.csv");
    expect(a).toBe(b);
  });
});

describe("exportObjectKey", () => {
  it("includes the split suffix when a split is given", async () => {
    const { exportObjectKey } = await import("./storage");
    expect(exportObjectKey("ds1", "exp1", "jsonl", "TRAIN")).toBe("exports/ds1/exp1_train.jsonl");
  });

  it("omits the split suffix for a full export", async () => {
    const { exportObjectKey } = await import("./storage");
    expect(exportObjectKey("ds1", "exp1", "csv", null)).toBe("exports/ds1/exp1.csv");
  });

  it("produces distinct keys for distinct exports of the same dataset", async () => {
    const { exportObjectKey } = await import("./storage");
    const a = exportObjectKey("ds1", "exp1", "jsonl", "TRAIN");
    const b = exportObjectKey("ds1", "exp2", "jsonl", "TRAIN");
    expect(a).not.toBe(b);
  });
});
