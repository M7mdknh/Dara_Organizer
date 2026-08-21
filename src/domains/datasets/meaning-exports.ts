import type { QualityTier } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Meaning-centered export schemas — the actual model-training-oriented
 * output the platform exists to produce, as opposed to a raw dump of
 * database rows. Each export type reads directly from the Concept graph /
 * UtteranceGroup / ResponsePattern structures built by import + AI
 * extraction (see src/domains/linguistics/extraction.ts), not from
 * DatasetVersion/DatasetRecord — these are not split into train/val/test,
 * they are corpus-shaped exports for downstream tooling to consume.
 *
 * Quality gate: defaults to GOLD/SILVER + VERIFIED only. CANDIDATE/
 * UNVERIFIED data is included only when includeUnverified is explicitly set
 * (CLAUDE.md: never casually export unverified data as training truth).
 */

export interface ExportFilters {
  dialectId?: string | null;
  includeUnverified?: boolean;
}

function qualityWhere(includeUnverified?: boolean): { quality?: { in: QualityTier[] }; verification?: "VERIFIED" } {
  const gold: QualityTier[] = ["GOLD", "SILVER"];
  return includeUnverified ? {} : { quality: { in: gold }, verification: "VERIFIED" };
}

export interface ConceptLexiconEntry {
  meaning_id: string;
  key: string;
  gloss: string;
  msa: string[];
  dialects: Record<string, string[]>;
  translations: Record<string, string[]>;
}

export async function exportConceptLexicon(filters: ExportFilters): Promise<ConceptLexiconEntry[]> {
  const concepts = await db.concept.findMany({
    include: {
      expressions: {
        where: { expression: qualityWhere(filters.includeUnverified) },
        include: { expression: { include: { dialect: true, language: true } } },
      },
    },
  });

  return concepts
    .filter((c) => c.expressions.length > 0)
    .map((c) => {
      const msa: string[] = [];
      const dialects: Record<string, string[]> = {};
      const translations: Record<string, string[]> = {};
      for (const ce of c.expressions) {
        const e = ce.expression;
        if (filters.dialectId && e.dialectId !== filters.dialectId && e.language.code !== "ar-MSA") continue;
        if (e.language.code === "ar-MSA") {
          msa.push(e.textOriginal);
        } else if (e.dialect) {
          (dialects[e.dialect.slug] ??= []).push(e.textOriginal);
        } else {
          (translations[e.language.code] ??= []).push(e.textOriginal);
        }
      }
      return { meaning_id: c.id, key: c.key, gloss: c.gloss, msa, dialects, translations };
    })
    .filter((e) => e.msa.length || Object.keys(e.dialects).length || Object.keys(e.translations).length);
}

export interface SentenceEquivalentEntry {
  utterance_id: string;
  meaning_msa: string | null;
  equivalents: Record<string, string[]>;
}

export async function exportSentenceEquivalents(filters: ExportFilters): Promise<SentenceEquivalentEntry[]> {
  const groups = await db.utteranceGroup.findMany({
    include: {
      sentences: {
        where: { ...qualityWhere(filters.includeUnverified), ...(filters.dialectId ? { dialectId: filters.dialectId } : {}) },
        include: { dialect: true, language: true },
      },
    },
  });

  return groups
    .filter((g) => g.sentences.length > 0)
    .map((g) => {
      const msaSentence = g.sentences.find((s) => s.language.code === "ar-MSA");
      const equivalents: Record<string, string[]> = {};
      for (const s of g.sentences) {
        if (s.language.code === "ar-MSA") continue;
        const key = s.dialect?.slug ?? s.language.code;
        (equivalents[key] ??= []).push(s.textOriginal);
      }
      return { utterance_id: g.id, meaning_msa: msaSentence?.textOriginal ?? g.meaning ?? null, equivalents };
    })
    .filter((e) => Object.keys(e.equivalents).length > 0);
}

export interface ConversationTrainingEntry {
  dialect: string | null;
  input: string;
  responses: { text: string; weight: number }[];
}

export async function exportConversationTraining(filters: ExportFilters): Promise<ConversationTrainingEntry[]> {
  const triggers = await db.responseTrigger.findMany({
    where: filters.dialectId ? { dialectId: filters.dialectId } : {},
    include: {
      dialect: true,
      pattern: {
        include: {
          variants: { where: qualityWhere(filters.includeUnverified) },
        },
      },
    },
  });

  return triggers
    .filter((t) => t.pattern.variants.length > 0)
    .map((t) => ({
      dialect: t.dialect?.slug ?? null,
      input: t.textOriginal,
      responses: t.pattern.variants
        .sort((a, b) => b.weight - a.weight)
        .map((v) => ({ text: v.textOriginal, weight: v.weight })),
    }));
}

export interface ChatFinetuneEntry {
  messages: { role: "user" | "assistant"; content: string }[];
  metadata: { dialect: string | null; meaning: string | null };
}

export async function exportChatFinetune(filters: ExportFilters): Promise<ChatFinetuneEntry[]> {
  const triggers = await db.responseTrigger.findMany({
    where: filters.dialectId ? { dialectId: filters.dialectId } : {},
    include: {
      dialect: true,
      pattern: {
        include: {
          variants: { where: qualityWhere(filters.includeUnverified), orderBy: { weight: "desc" }, take: 1 },
          intent: true,
        },
      },
    },
  });

  return triggers
    .filter((t) => t.pattern.variants.length > 0)
    .map((t) => ({
      messages: [
        { role: "user" as const, content: t.textOriginal },
        { role: "assistant" as const, content: t.pattern.variants[0].textOriginal },
      ],
      metadata: { dialect: t.dialect?.slug ?? null, meaning: t.pattern.intent?.name ?? t.pattern.name },
    }));
}

export function toJsonlGeneric(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}
