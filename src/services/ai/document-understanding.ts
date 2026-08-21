import { z } from "zod";
import { resolveProvider } from "@/services/ai/enrichment";

/**
 * AI document-understanding stage: given a sample of an uploaded file's
 * columns/rows (already deterministically parsed — see
 * src/domains/imports/parse.ts and analyze.ts), ask the model what the file
 * actually contains, one call per document (not per row/word — see cost
 * control notes in analyze.ts). Structured output only; the raw model
 * response is Zod-validated before anything downstream may trust it, and a
 * failed/malformed response simply means "no AI signal" — the deterministic
 * column-content guard in analyze.ts is authoritative regardless and is
 * never weakened by this stage.
 */

export const ColumnRoleSchema = z.enum([
  "timestamp",
  "sequence_id",
  "speaker",
  "linguistic_text",
  "translation_or_meaning",
  "dialect_label",
  "language_label",
  "other_metadata",
]);

export const DocumentAnalysisSchema = z.object({
  documentType: z.enum([
    "subtitle_transcript",
    "word_list",
    "sentence_list",
    "conversation_dialogue",
    "mixed",
    "unknown",
  ]),
  primaryLanguageGuess: z.string().nullable(),
  primaryDialectGuess: z.string().nullable(),
  columns: z.array(
    z.object({
      column: z.string(),
      role: ColumnRoleSchema,
      importAsLinguisticText: z.boolean(),
    }),
  ),
  contains: z.object({
    sentences: z.boolean(),
    expressions: z.boolean(),
    translations: z.boolean(),
    conversations: z.boolean(),
    responses: z.enum(["yes", "no", "possible"]),
  }),
  reasoning: z.string().nullable(),
});

export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

const DOCUMENT_ANALYSIS_JSON_SCHEMA = {
  name: "document_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      documentType: {
        type: "string",
        enum: ["subtitle_transcript", "word_list", "sentence_list", "conversation_dialogue", "mixed", "unknown"],
      },
      primaryLanguageGuess: { type: ["string", "null"], description: "Best-guess language name, e.g. 'Arabic', 'English'" },
      primaryDialectGuess: {
        type: ["string", "null"],
        description: "Best-guess Arabic dialect name if applicable, e.g. 'Jeddawi', 'Najdi', 'Egyptian'. Null if not Arabic or not determinable.",
      },
      columns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            column: { type: "string" },
            role: {
              type: "string",
              enum: [
                "timestamp",
                "sequence_id",
                "speaker",
                "linguistic_text",
                "translation_or_meaning",
                "dialect_label",
                "language_label",
                "other_metadata",
              ],
            },
            importAsLinguisticText: {
              type: "boolean",
              description: "True only for columns containing real spoken/written original-language content — never for timestamps, ids, or speaker labels.",
            },
          },
          required: ["column", "role", "importAsLinguisticText"],
        },
      },
      contains: {
        type: "object",
        additionalProperties: false,
        properties: {
          sentences: { type: "boolean" },
          expressions: { type: "boolean" },
          translations: { type: "boolean" },
          conversations: { type: "boolean" },
          responses: { type: "string", enum: ["yes", "no", "possible"] },
        },
        required: ["sentences", "expressions", "translations", "conversations", "responses"],
      },
      reasoning: { type: ["string", "null"] },
    },
    required: ["documentType", "primaryLanguageGuess", "primaryDialectGuess", "columns", "contains", "reasoning"],
  },
};

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildPrompt(params: {
  filename: string;
  columns: string[];
  sampleRows: Record<string, string>[];
  metadataColumnsAlreadyDetected: string[];
}): string {
  const lines: string[] = [
    `Filename: ${params.filename}`,
    `Columns: ${params.columns.join(", ")}`,
  ];
  if (params.metadataColumnsAlreadyDetected.length) {
    lines.push(
      `Already deterministically identified as metadata (timestamps/sequence numbers), NOT linguistic text: ${params.metadataColumnsAlreadyDetected.join(", ")}. Keep these as metadata roles.`,
    );
  }
  lines.push("\nSample rows (JSON):");
  lines.push(JSON.stringify(params.sampleRows.slice(0, 15), null, 2));
  lines.push(
    "\nClassify what this file contains for a linguistic data platform. For each column, decide its role. " +
      "Timestamps, row numbers, and speaker IDs are metadata, never linguistic text — even if a column header " +
      "misleadingly contains a word like 'text'. A column is linguistic_text or translation_or_meaning only if " +
      "its actual sampled values are genuine spoken/written language content.",
  );
  return lines.join("\n");
}

export async function analyzeDocumentWithAi(params: {
  filename: string;
  columns: string[];
  sampleRows: Record<string, string>[];
  metadataColumnsAlreadyDetected: string[];
}): Promise<DocumentAnalysis | null> {
  const provider = await resolveProvider();
  if (!provider) return null;
  if (params.columns.length < 2) return null; // single-column files are unambiguous — deterministic path suffices, save the call

  try {
    const result = await provider.complete({
      system:
        "You are a linguistic document-understanding assistant for an Arabic dialect data platform. " +
        "You classify file structure only — you never fabricate content, confidence, or statistics.",
      prompt: buildPrompt(params),
      jsonSchema: DOCUMENT_ANALYSIS_JSON_SCHEMA,
      reasoningEffort: "low",
    });
    const raw = result.json ?? safeParseJson(result.text);
    const parsed = DocumentAnalysisSchema.safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    // AI is an enhancement layer here, not a hard dependency — a transient
    // API failure must never block import analysis, only reduce its quality
    // back to the deterministic baseline.
    return null;
  }
}
