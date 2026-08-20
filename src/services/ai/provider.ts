/**
 * Provider-independent AI adapter.
 *
 * The platform never couples linguistic data to one vendor. Providers
 * implement a single `complete` call (plus optional embeddings); enrichment
 * and semantic-matching logic build prompts and parse results independently
 * of the provider. All generated assertions are stored with
 * provider/model/timestamp provenance and routed through review — AI output
 * never silently overwrites human data.
 */

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export interface AiCompletionRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Request a typed structured result instead of free-form prose, when the provider supports it. */
  jsonSchema?: JsonSchemaSpec;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiCompletionResult {
  text: string;
  /** Parsed structured output, present when jsonSchema was requested and honored. */
  json?: unknown;
  provider: string;
  model: string;
  usage?: AiUsage;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly isMock: boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}

export interface EmbeddingResult {
  vectors: number[][];
  provider: string;
  model: string;
  dimensions: number;
  usage?: AiUsage;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; maxRetries: number },
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      // Retry on rate limiting / transient server errors; not on 4xx client errors.
      if (res.status === 429 || res.status >= 500) {
        if (attempt < opts.maxRetries) {
          const backoffMs = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < opts.maxRetries) {
        const backoffMs = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed after retries");
}

// ---------------- Anthropic ----------------

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  constructor(
    private apiKey: string,
    readonly model: string,
  ) {}

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }
}

// ---------------- OpenAI (Responses API + Embeddings) ----------------

interface OpenAiRetryConfig {
  timeoutMs: number;
  maxRetries: number;
}

export class OpenAiProvider implements AiProvider, EmbeddingProvider {
  readonly name = "openai";
  readonly isMock = false;
  readonly dimensions: number;

  constructor(
    private apiKey: string,
    readonly model: string,
    private embeddingModel: string,
    dimensions: number,
    private retry: OpenAiRetryConfig = { timeoutMs: 120_000, maxRetries: 3 },
  ) {
    this.dimensions = dimensions;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const input: { role: string; content: string }[] = [];
    if (req.system) input.push({ role: "developer", content: req.system });
    input.push({ role: "user", content: req.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      input,
      max_output_tokens: req.maxTokens ?? 2048,
      reasoning: { effort: req.reasoningEffort ?? "medium" },
    };
    if (req.jsonSchema) {
      body.text = {
        format: {
          type: "json_schema",
          name: req.jsonSchema.name,
          schema: req.jsonSchema.schema,
          strict: true,
        },
      };
    }

    const res = await fetchWithRetry(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      },
      this.retry,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI Responses API error ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };

    let text = data.output_text ?? "";
    if (!text && data.output) {
      for (const item of data.output) {
        if (item.type === "message" && item.content) {
          text += item.content
            .filter((c) => c.type === "output_text")
            .map((c) => c.text ?? "")
            .join("");
        }
      }
    }

    let json: unknown;
    if (req.jsonSchema && text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    return {
      text,
      json,
      provider: this.name,
      model: this.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) return { vectors: [], provider: this.name, model: this.embeddingModel, dimensions: this.dimensions };
    const res = await fetchWithRetry(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.embeddingModel, input: texts, dimensions: this.dimensions }),
      },
      this.retry,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI Embeddings API error ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const vectors = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return {
      vectors,
      provider: this.name,
      model: this.embeddingModel,
      dimensions: this.dimensions,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, totalTokens: data.usage.total_tokens }
        : undefined,
    };
  }
}

// ---------------- Mock ----------------

/**
 * Development-only mock. Its output is clearly labeled and must never be
 * presented as real linguistic content. It exists so the enrichment and
 * semantic-matching workflow (jobs, review routing, provenance) can be
 * exercised without credentials, and so tests never make real network calls.
 */
class MockProvider implements AiProvider, EmbeddingProvider {
  readonly name = "mock";
  readonly model = "mock-dev-provider";
  readonly isMock = true;
  readonly dimensions: number;

  constructor(dimensions = 3072) {
    // Matches the real embedding dimensionality (pgvector's Embedding.vector
    // column has a fixed width — see prisma/schema.prisma) so the mock
    // provider is a genuine drop-in for exercising the semantic-matching
    // pipeline end-to-end, not just a dimension mismatch waiting to happen.
    this.dimensions = dimensions;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const text = JSON.stringify({
      _mock: true,
      note: "MOCK PROVIDER OUTPUT — not real linguistic data. Configure a real AI provider in Settings.",
      promptPreview: req.prompt.slice(0, 120),
      decision: "UNCERTAIN",
      reason: "Mock provider never issues a real linguistic judgment.",
    });
    return { text, json: req.jsonSchema ? JSON.parse(text) : undefined, provider: this.name, model: this.model };
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    // Deterministic pseudo-embedding derived from a cheap string hash, purely
    // so vector-search code paths are exercisable in tests/dev without a
    // real provider. Never meaningful as a linguistic representation.
    const vectors = texts.map((t) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      const v: number[] = [];
      for (let i = 0; i < this.dimensions; i++) {
        h = Math.imul(h ^ i, 0x01000193);
        v.push(((h >>> 0) % 2000) / 1000 - 1); // range [-1, 1)
      }
      return v;
    });
    return { vectors, provider: this.name, model: this.model, dimensions: this.dimensions };
  }
}

export function getAiProvider(config: {
  provider: string;
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  timeoutMs?: number;
  maxRetries?: number;
}): AiProvider | null {
  switch (config.provider) {
    case "anthropic": {
      if (!config.apiKey) return null;
      return new AnthropicProvider(config.apiKey, config.model || "claude-sonnet-5");
    }
    case "openai": {
      if (!config.apiKey) return null;
      return new OpenAiProvider(
        config.apiKey,
        config.model || "gpt-5.6-terra",
        config.embeddingModel || "text-embedding-3-large",
        config.embeddingDimensions || 3072,
        { timeoutMs: config.timeoutMs ?? 120_000, maxRetries: config.maxRetries ?? 3 },
      );
    }
    case "mock":
      return new MockProvider(config.embeddingDimensions || 3072);
    case "none":
    default:
      return null;
  }
}

export function isEmbeddingProvider(p: AiProvider | null): p is AiProvider & EmbeddingProvider {
  return !!p && typeof (p as Partial<EmbeddingProvider>).embed === "function";
}
