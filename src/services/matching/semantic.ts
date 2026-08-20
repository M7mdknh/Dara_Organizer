import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveProvider, resolveAdjudicationProvider } from "@/services/ai/enrichment";
import { embedQueryText, retrieveCandidates } from "@/services/ai/embeddings";

/**
 * Staged semantic-matching cascade (only reached when deterministic
 * matching in src/services/matching.ts could not resolve the item):
 *
 *   normalize -> [deterministic — handled elsewhere] -> embed candidate
 *   -> pgvector top-K retrieval -> LLM judgment -> optional adjudication
 *   escalation -> evidence returned for the review queue / quality policy.
 *
 * Vector similarity is a RETRIEVAL signal, never a final linguistic
 * decision. The LLM judges a SMALL retrieved candidate set, not the whole
 * corpus. Sentence/source-sentence context is passed when available and
 * weighted as stronger evidence than an isolated word, per CLAUDE.md.
 */

export type SemanticDecision = "SAME" | "RELATED" | "DIFFERENT" | "UNCERTAIN";

export interface CandidateConcept {
  conceptId: string;
  key: string;
  gloss: string;
  similarity: number;
  rank: number;
  existingExpressions: string[];
}

export interface SemanticEvidence {
  ranAt: string;
  contextAvailable: boolean;
  candidates: CandidateConcept[];
  modelDecision: SemanticDecision | null;
  modelReason: string | null;
  chosenConceptId: string | null;
  provider: string | null;
  model: string | null;
  escalated: boolean;
  adjudicationProvider: string | null;
  adjudicationModel: string | null;
  humanVerified: false;
}

const JUDGMENT_SCHEMA = {
  name: "semantic_judgment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["SAME", "RELATED", "DIFFERENT", "UNCERTAIN"] },
      best_candidate_index: { type: ["integer", "null"], description: "0-based index into the candidate list, or null if none apply" },
      reason: { type: "string" },
    },
    required: ["decision", "best_candidate_index", "reason"],
  },
};

function buildJudgmentPrompt(params: {
  text: string;
  dialectName: string | null;
  sourceSentence: string | null;
  candidates: CandidateConcept[];
}): string {
  const lines = [`New expression:\n${params.text}`, `\nDialect: ${params.dialectName ?? "unknown"}`];
  if (params.sourceSentence) {
    lines.push(`\nSource sentence (stronger evidence than the isolated word):\n${params.sourceSentence}`);
  }
  lines.push("\nCandidate concepts:");
  params.candidates.forEach((c, i) => {
    lines.push(
      `${i}. ${c.key}\n   Meaning: ${c.gloss}\n   Existing expressions: ${c.existingExpressions.join(", ") || "(none)"}`,
    );
  });
  lines.push(
    "\nJudge whether the new expression expresses the SAME meaning as one of these candidate concepts, is RELATED but distinct, is DIFFERENT from all of them, or the evidence is UNCERTAIN. Prefer sentence context over the isolated word when both are given. Do not fabricate confidence — if genuinely unsure, say UNCERTAIN.",
  );
  return lines.join("\n");
}

/**
 * Retrieve top-K candidate concepts for a new expression via pgvector, then
 * ask the primary reasoning model to judge it against that small set.
 * Escalates to the adjudication model only when the primary judgment is
 * UNCERTAIN and escalation is enabled. Never auto-approves from vector
 * similarity alone (SEMANTIC_AUTO_APPROVE only gates downstream policy,
 * this function always just returns evidence).
 */
export async function judgeExpressionAgainstConcepts(params: {
  text: string;
  dialectName: string | null;
  sourceSentence: string | null;
}): Promise<SemanticEvidence | null> {
  if (!env.SEMANTIC_MATCHING_ENABLED) return null;

  const queryText = params.sourceSentence
    ? `${params.text}\nContext: ${params.sourceSentence}`
    : params.text;
  const queryVector = await embedQueryText(queryText);
  if (!queryVector) return null; // no embedding provider configured

  const retrieved = await retrieveCandidates("CONCEPT", queryVector, env.SEMANTIC_TOP_K, env.SEMANTIC_VECTOR_MIN_SIMILARITY);
  if (retrieved.length === 0) {
    return {
      ranAt: new Date().toISOString(),
      contextAvailable: !!params.sourceSentence,
      candidates: [],
      modelDecision: null,
      modelReason: "No candidate concepts met the retrieval similarity threshold.",
      chosenConceptId: null,
      provider: null,
      model: null,
      escalated: false,
      adjudicationProvider: null,
      adjudicationModel: null,
      humanVerified: false,
    };
  }

  const concepts = await db.concept.findMany({
    where: { id: { in: retrieved.map((r) => r.entityId) } },
    include: { expressions: { include: { expression: true }, take: 8 } },
  });
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const candidates: CandidateConcept[] = retrieved
    .map((r, i) => {
      const c = conceptById.get(r.entityId);
      if (!c) return null;
      return {
        conceptId: c.id,
        key: c.key,
        gloss: c.gloss,
        similarity: r.similarity,
        rank: i + 1,
        existingExpressions: c.expressions.map((e) => e.expression.textOriginal),
      };
    })
    .filter((c): c is CandidateConcept => c !== null);

  if (candidates.length === 0) {
    return {
      ranAt: new Date().toISOString(),
      contextAvailable: !!params.sourceSentence,
      candidates: [],
      modelDecision: null,
      modelReason: "Retrieved concepts no longer exist.",
      chosenConceptId: null,
      provider: null,
      model: null,
      escalated: false,
      adjudicationProvider: null,
      adjudicationModel: null,
      humanVerified: false,
    };
  }

  const provider = await resolveProvider();
  if (!provider) {
    return {
      ranAt: new Date().toISOString(),
      contextAvailable: !!params.sourceSentence,
      candidates,
      modelDecision: null,
      modelReason: "No AI provider configured — retrieval evidence only, no LLM judgment.",
      chosenConceptId: null,
      provider: null,
      model: null,
      escalated: false,
      adjudicationProvider: null,
      adjudicationModel: null,
      humanVerified: false,
    };
  }

  const prompt = buildJudgmentPrompt({
    text: params.text,
    dialectName: params.dialectName,
    sourceSentence: params.sourceSentence,
    candidates,
  });
  const result = await provider.complete({
    system: "You are an Arabic dialectology semantic-matching adjudicator. Be conservative and evidence-based; never fabricate confidence.",
    prompt,
    jsonSchema: JUDGMENT_SCHEMA,
  });
  const judgment = (result.json ?? safeParse(result.text)) as
    | { decision: SemanticDecision; best_candidate_index: number | null; reason: string }
    | null;

  let decision = judgment?.decision ?? "UNCERTAIN";
  let reason = judgment?.reason ?? "Model did not return a parseable judgment.";
  let chosenConceptId =
    judgment?.best_candidate_index != null ? (candidates[judgment.best_candidate_index]?.conceptId ?? null) : null;
  let escalated = false;
  let adjudicationProvider: string | null = null;
  let adjudicationModel: string | null = null;

  if (decision === "UNCERTAIN" && env.SEMANTIC_ADJUDICATION_ENABLED) {
    const adjudicator = await resolveAdjudicationProvider();
    if (adjudicator) {
      escalated = true;
      adjudicationProvider = adjudicator.name;
      adjudicationModel = adjudicator.model;
      const adjResult = await adjudicator.complete({
        system:
          "You are a senior Arabic dialectology adjudicator handling a case the primary model could not resolve confidently. Be conservative; UNCERTAIN is an acceptable final answer.",
        prompt,
        jsonSchema: JUDGMENT_SCHEMA,
        reasoningEffort: "high",
      });
      const adjJudgment = (adjResult.json ?? safeParse(adjResult.text)) as
        | { decision: SemanticDecision; best_candidate_index: number | null; reason: string }
        | null;
      if (adjJudgment) {
        decision = adjJudgment.decision;
        reason = adjJudgment.reason;
        chosenConceptId =
          adjJudgment.best_candidate_index != null
            ? (candidates[adjJudgment.best_candidate_index]?.conceptId ?? null)
            : null;
      }
    }
  }

  return {
    ranAt: new Date().toISOString(),
    contextAvailable: !!params.sourceSentence,
    candidates,
    modelDecision: decision,
    modelReason: reason,
    chosenConceptId: decision === "SAME" || decision === "RELATED" ? chosenConceptId : null,
    provider: provider.name,
    model: provider.model,
    escalated,
    adjudicationProvider,
    adjudicationModel,
    humanVerified: false,
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
