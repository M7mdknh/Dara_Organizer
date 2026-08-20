import { describe, it, expect } from "vitest";
import { getAiProvider, isEmbeddingProvider } from "./provider";

/**
 * These tests exercise the mock provider only — no network calls, no
 * OpenAI/Anthropic API key required. This is deliberate: automated tests
 * must never depend on a paid external API. Real-provider wiring (request
 * shape, retries) is documented as manually reviewed, not automatically
 * tested against a live API, in the final report.
 */

describe("getAiProvider", () => {
  it("returns null for anthropic without an API key", () => {
    expect(getAiProvider({ provider: "anthropic" })).toBeNull();
  });

  it("returns null for openai without an API key", () => {
    expect(getAiProvider({ provider: "openai" })).toBeNull();
  });

  it("returns null for provider 'none'", () => {
    expect(getAiProvider({ provider: "none" })).toBeNull();
  });

  it("always returns the mock provider regardless of API keys", () => {
    const provider = getAiProvider({ provider: "mock" });
    expect(provider).not.toBeNull();
    expect(provider?.isMock).toBe(true);
  });
});

describe("mock provider", () => {
  it("labels its completion output as mock and never presents it as real", async () => {
    const provider = getAiProvider({ provider: "mock" })!;
    const result = await provider.complete({ prompt: "test prompt" });
    const parsed = JSON.parse(result.text);
    expect(parsed._mock).toBe(true);
    expect(result.text).toContain("MOCK PROVIDER OUTPUT");
  });

  it("is registered as an embedding provider", () => {
    const provider = getAiProvider({ provider: "mock" });
    expect(isEmbeddingProvider(provider)).toBe(true);
  });

  it("produces deterministic embeddings for the same text", async () => {
    const provider = getAiProvider({ provider: "mock" })!;
    expect(isEmbeddingProvider(provider)).toBe(true);
    if (!isEmbeddingProvider(provider)) return;
    const a = await provider.embed(["hello"]);
    const b = await provider.embed(["hello"]);
    expect(a.vectors[0]).toEqual(b.vectors[0]);
  });

  it("produces different embeddings for different text", async () => {
    const provider = getAiProvider({ provider: "mock" })!;
    if (!isEmbeddingProvider(provider)) throw new Error("expected embedding provider");
    const a = await provider.embed(["hello"]);
    const b = await provider.embed(["goodbye"]);
    expect(a.vectors[0]).not.toEqual(b.vectors[0]);
  });

  it("returns a vector of the declared dimensionality", async () => {
    const provider = getAiProvider({ provider: "mock" })!;
    if (!isEmbeddingProvider(provider)) throw new Error("expected embedding provider");
    const result = await provider.embed(["some text"]);
    expect(result.vectors[0]).toHaveLength(provider.dimensions);
  });
});

describe("isEmbeddingProvider", () => {
  it("returns false for null", () => {
    expect(isEmbeddingProvider(null)).toBe(false);
  });
});
