import { db } from "@/lib/db";
import { containsArabic } from "@/services/normalization";
import type { ImportMapping } from "@/domains/imports/service";

/**
 * Deterministic, content-based analysis of an already-uploaded import job's
 * rows: guesses column mapping, whether rows are words/expressions or
 * sentences, and matches dialect/language columns against existing taxonomy
 * — so a non-technical user can accept a plain-language summary instead of
 * manually mapping columns. Falls back gracefully (empty guesses) when
 * nothing matches; the manual mapping UI remains available as "Advanced".
 */

export interface ImportAnalysis {
  target: "expression" | "sentence";
  columns: Record<string, string>;
  defaults: {
    languageId: string | null;
    dialectId: string | null;
    quality: "CANDIDATE";
    training: "UNDECIDED";
  };
  summary: string;
  detected: {
    rowCount: number;
    textColumn: string | null;
    scriptsSeen: ("arabic" | "latin")[];
    dialectMatches: { name: string; dialectId: string; count: number }[];
    languageGuess: { code: string; languageId: string } | null;
    avgWordsPerRow: number;
  };
}

const FIELD_KEYWORDS: Record<string, string[]> = {
  text: ["text", "expression", "sentence", "arabic", "word", "phrase", "utterance"],
  meaning: ["meaning", "gloss", "english", "translation", "translate"],
  dialect: ["dialect", "accent"],
  language: ["language", "lang"],
  conceptKey: ["concept"],
  pronunciation: ["pronunciation", "phonetic", "transliteration"],
  ipa: ["ipa"],
  category: ["category", "topic"],
  intent: ["intent"],
  situation: ["situation", "context"],
  register: ["register", "formality"],
  notes: ["note", "comment"],
  utteranceGroup: ["group", "cluster"],
};

const EXPRESSION_KEYS = ["text", "conceptKey", "meaning", "dialect", "language", "register", "pronunciation", "ipa", "category", "notes"];
const SENTENCE_KEYS = ["text", "meaning", "dialect", "language", "utteranceGroup", "intent", "situation", "register", "category", "pronunciation", "notes"];

function normCol(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export function guessColumnMapping(columns: string[], target: "expression" | "sentence"): Record<string, string> {
  const fields = target === "expression" ? EXPRESSION_KEYS : SENTENCE_KEYS;
  const guess: Record<string, string> = {};
  for (const field of fields) {
    for (const col of columns) {
      if (guess[field]) break;
      const n = normCol(col);
      const kws = FIELD_KEYWORDS[field] ?? [];
      if (kws.some((k) => n.includes(k))) guess[field] = col;
    }
  }
  return guess;
}

export async function analyzeRows(columns: string[], rows: Record<string, string>[]): Promise<ImportAnalysis> {
  const prelimMapping = guessColumnMapping(columns, "sentence");
  const textCol = prelimMapping.text ?? columns[0] ?? "";
  const sample = rows.slice(0, 300).map((r) => (r[textCol] ?? "").trim()).filter(Boolean);
  const avgWords = sample.length
    ? sample.reduce((s, t) => s + t.split(/\s+/).filter(Boolean).length, 0) / sample.length
    : 0;
  const target: "expression" | "sentence" = avgWords > 0 && avgWords <= 2.5 ? "expression" : "sentence";

  const columnMapping = guessColumnMapping(columns, target);
  if (!columnMapping.text) columnMapping.text = textCol;

  const arabicCount = sample.filter(containsArabic).length;
  const scriptsSeen: ("arabic" | "latin")[] = [];
  if (arabicCount > 0) scriptsSeen.push("arabic");
  if (arabicCount < sample.length) scriptsSeen.push("latin");

  const [dialects, languages] = await Promise.all([db.dialectNode.findMany(), db.language.findMany()]);
  const norm = (s: string) => s.trim().toLowerCase();

  const dialectByKey = new Map<string, { id: string; name: string }>();
  for (const d of dialects) {
    dialectByKey.set(norm(d.name), { id: d.id, name: d.name });
    dialectByKey.set(norm(d.slug), { id: d.id, name: d.name });
    if (d.nameAr) dialectByKey.set(norm(d.nameAr), { id: d.id, name: d.name });
  }

  const dialectCol = columnMapping.dialect;
  const dialectCounts = new Map<string, { dialectId: string; name: string; count: number }>();
  if (dialectCol) {
    for (const row of rows) {
      const raw = norm(row[dialectCol] ?? "");
      if (!raw) continue;
      const match = dialectByKey.get(raw);
      if (!match) continue;
      const cur = dialectCounts.get(match.id) ?? { dialectId: match.id, name: match.name, count: 0 };
      cur.count++;
      dialectCounts.set(match.id, cur);
    }
  }
  const dialectMatches = [...dialectCounts.values()].sort((a, b) => b.count - a.count);

  const languageCol = columnMapping.language;
  let languageGuess: { code: string; languageId: string } | null = null;
  if (languageCol) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const raw = norm(row[languageCol] ?? "");
      if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    let best: [string, number] | null = null;
    for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
    if (best) {
      const lang = languages.find((l) => norm(l.code) === best![0] || norm(l.name) === best![0]);
      if (lang) languageGuess = { code: lang.code, languageId: lang.id };
    }
  }
  if (!languageGuess) {
    const preferredCode = arabicCount > sample.length / 2 ? "ar" : "en";
    const lang = languages.find((l) => norm(l.code) === preferredCode);
    if (lang) languageGuess = { code: lang.code, languageId: lang.id };
  }

  const parts: string[] = [];
  parts.push(`Detected ${rows.length.toLocaleString()} rows of ${target === "expression" ? "words/expressions" : "sentences"}`);
  if (scriptsSeen.includes("arabic")) parts.push("in Arabic script");
  if (columnMapping.meaning) parts.push(`with a meaning/translation column ("${columnMapping.meaning}")`);
  if (dialectMatches.length) {
    const top = dialectMatches.slice(0, 3).map((d) => `${d.name} (${d.count})`).join(", ");
    parts.push(`dialects matched: ${top}`);
  } else if (dialectCol) {
    parts.push(`a dialect column ("${dialectCol}") was found but its values didn't match any known dialect — pick a default below`);
  }
  if (languageGuess) parts.push(`language: ${languageGuess.code}`);

  return {
    target,
    columns: columnMapping,
    defaults: {
      languageId: languageGuess?.languageId ?? null,
      dialectId: dialectMatches[0]?.dialectId ?? null,
      quality: "CANDIDATE",
      training: "UNDECIDED",
    },
    summary: parts.join(", ") + ".",
    detected: {
      rowCount: rows.length,
      textColumn: columnMapping.text ?? null,
      scriptsSeen,
      dialectMatches: dialectMatches.map((d) => ({ name: d.name, dialectId: d.dialectId, count: d.count })),
      languageGuess,
      avgWordsPerRow: Math.round(avgWords * 10) / 10,
    },
  };
}

/** Throws if languageId couldn't be auto-detected — the caller must ask the user to pick one. */
export function toImportMapping(analysis: ImportAnalysis): ImportMapping {
  if (!analysis.defaults.languageId) {
    throw new Error("Could not detect a language for this file — pick one before importing.");
  }
  return {
    target: analysis.target,
    columns: analysis.columns,
    defaults: { ...analysis.defaults, languageId: analysis.defaults.languageId },
  };
}
