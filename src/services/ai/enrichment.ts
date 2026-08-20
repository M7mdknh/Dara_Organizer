import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getAiProvider, type AiProvider } from "@/services/ai/provider";

/**
 * Enrichment jobs: build prompts for a target entity, call the provider,
 * store provenance, and route results to the Review Inbox as AI suggestions.
 * Nothing is applied to human-curated data without review.
 */

export type EnrichmentType =
  | "translate"
  | "classify"
  | "detect_dialect"
  | "suggest_pronunciation"
  | "suggest_responses";

interface ResolvedAiSettings {
  provider: string;
  model?: string;
}

async function resolveAiSettings(): Promise<ResolvedAiSettings> {
  const setting = await db.setting.findUnique({ where: { key: "ai" } });
  const cfg = (setting?.value ?? {}) as { provider?: string; model?: string };
  return { provider: cfg.provider ?? env.AI_PROVIDER, model: cfg.model };
}

function apiKeyFor(provider: string): string | undefined {
  if (provider === "anthropic") return env.ANTHROPIC_API_KEY;
  if (provider === "openai") return env.OPENAI_API_KEY;
  return undefined;
}

/** Primary provider — used for enrichment, classification, translation, and initial semantic judgment. */
export async function resolveProvider(): Promise<AiProvider | null> {
  const { provider, model } = await resolveAiSettings();
  return getAiProvider({
    provider,
    apiKey: apiKeyFor(provider),
    model: model ?? (provider === "openai" ? env.OPENAI_MODEL : env.AI_MODEL),
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}

/**
 * Higher-quality adjudication provider for unusually difficult semantic
 * cases only. Only meaningful for the openai provider; falls back to the
 * primary provider for anthropic/mock so the escalation path always works.
 */
export async function resolveAdjudicationProvider(): Promise<AiProvider | null> {
  const { provider } = await resolveAiSettings();
  if (provider !== "openai") return resolveProvider();
  return getAiProvider({
    provider,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_ADJUDICATION_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}

/** Embedding provider — only OpenAI implements EmbeddingProvider today (or the mock, for tests/dev). */
export async function resolveEmbeddingProvider(): Promise<AiProvider | null> {
  const { provider } = await resolveAiSettings();
  const embeddingCapable = provider === "openai" || provider === "mock" ? provider : "none";
  if (embeddingCapable === "none") return null;
  return getAiProvider({
    provider: embeddingCapable,
    apiKey: apiKeyFor(embeddingCapable),
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const SYSTEM = `You are an Arabic dialectology assistant inside a linguistic data platform.
Answer ONLY with a single JSON object, no prose. Be conservative: if unsure, say so in the JSON with "uncertain": true rather than guessing confidently. Never invent corpus statistics.`;

async function buildPrompt(type: EnrichmentType, entityType: string, entityId: string): Promise<string> {
  if (entityType === "sentence") {
    const s = await db.sentence.findUnique({
      where: { id: entityId },
      include: { dialect: true, language: true },
    });
    if (!s) throw new Error("Sentence not found");
    const base = `Sentence: "${s.textOriginal}"\nDialect: ${s.dialect?.name ?? "unknown"}\nLanguage: ${s.language.name}\nKnown meaning: ${s.meaning ?? "unknown"}`;
    switch (type) {
      case "translate":
        return `${base}\n\nProvide natural EQUIVALENT utterances (not literal translations) in MSA, English, French, and Spanish. JSON schema: {"msa": string, "english": string, "french": string, "spanish": string, "notes": string}`;
      case "classify":
        return `${base}\n\nSuggest classification. JSON schema: {"intent": string, "topic": string, "situation": string, "register": string, "conversationalFunction": string, "uncertain": boolean}`;
      case "detect_dialect":
        return `${base}\n\nWhich Arabic dialect is this most likely from? JSON schema: {"dialect": string, "evidence": string, "confidenceLabel": "HIGH"|"MEDIUM"|"LOW", "uncertain": boolean}`;
      case "suggest_pronunciation":
        return `${base}\n\nSuggest pronunciation. JSON schema: {"diacritized": string, "arabicPhonetic": string, "ipa": string, "notes": string}`;
      case "suggest_responses":
        return `${base}\n\nSuggest 3-5 natural conversational responses in the same dialect. JSON schema: {"responses": [{"text": string, "commonnessEstimate": "VERY_HIGH"|"HIGH"|"MEDIUM"|"LOW", "note": string}]}`;
    }
  }
  if (entityType === "expression") {
    const e = await db.expression.findUnique({
      where: { id: entityId },
      include: { dialect: true, language: true, concepts: { include: { concept: true } } },
    });
    if (!e) throw new Error("Expression not found");
    const base = `Expression: "${e.textOriginal}"\nDialect: ${e.dialect?.name ?? "unknown"}\nLanguage: ${e.language.name}\nMeaning: ${e.meaningNote ?? e.concepts[0]?.concept.gloss ?? "unknown"}`;
    switch (type) {
      case "translate":
        return `${base}\n\nProvide natural equivalents. JSON schema: {"msa": string, "english": string, "french": string, "spanish": string, "notes": string}`;
      case "classify":
        return `${base}\n\nSuggest classification. JSON schema: {"category": string, "register": string, "type": "WORD"|"PHRASE"|"IDIOM"|"SLANG"|"GREETING"|"FILLER"|"DISCOURSE_MARKER", "uncertain": boolean}`;
      case "detect_dialect":
        return `${base}\n\nWhich Arabic dialect is this most likely from? JSON schema: {"dialect": string, "evidence": string, "confidenceLabel": "HIGH"|"MEDIUM"|"LOW", "uncertain": boolean}`;
      case "suggest_pronunciation":
        return `${base}\n\nSuggest pronunciation. JSON schema: {"diacritized": string, "arabicPhonetic": string, "ipa": string, "notes": string}`;
      case "suggest_responses":
        return `${base}\n\nIf this expression is a conversational trigger (greeting, praise, thanks...), suggest 3-5 natural responses in the same dialect. JSON schema: {"responses": [{"text": string, "commonnessEstimate": "VERY_HIGH"|"HIGH"|"MEDIUM"|"LOW", "note": string}]}`;
    }
  }
  throw new Error(`Enrichment not supported for entity type ${entityType}`);
}

export async function runEnrichment(
  type: EnrichmentType,
  entityType: string,
  entityId: string,
): Promise<{ jobId: string; status: string }> {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error("No AI provider configured. Set the provider in Settings → AI.");
  }
  const prompt = await buildPrompt(type, entityType, entityId);
  const job = await db.enrichmentJob.create({
    data: {
      type,
      status: "RUNNING",
      provider: provider.name,
      model: provider.model,
      entityType,
      entityId,
      input: { prompt } as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });

  try {
    const result = await provider.complete({ system: SYSTEM, prompt });
    const parsed = extractJson(result.text);
    await db.enrichmentJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        output: (parsed ?? { raw: result.text }) as Prisma.InputJsonValue,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
        finishedAt: new Date(),
      },
    });
    // Route to review: AI output is a suggestion, never an automatic edit.
    await db.reviewItem.create({
      data: {
        type: "AI_SUGGESTION",
        title: `${provider.isMock ? "[MOCK] " : ""}AI ${type.replaceAll("_", " ")} suggestion`,
        payload: {
          enrichmentType: type,
          provider: provider.name,
          model: provider.model,
          isMock: provider.isMock,
          suggestion: parsed ?? { raw: result.text },
          generatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        entityType,
        entityId,
      },
    });
    return { jobId: job.id, status: "COMPLETED" };
  } catch (err) {
    await db.enrichmentJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown error", finishedAt: new Date() },
    });
    throw err;
  }
}
