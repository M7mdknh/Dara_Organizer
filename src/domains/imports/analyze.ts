import { db } from "@/lib/db";
import { containsArabic } from "@/services/normalization";
import type { ImportMapping } from "@/domains/imports/service";
import { analyzeDocumentWithAi, type DocumentAnalysis } from "@/services/ai/document-understanding";

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
    metadataColumns: string[];
    textColumnOverridden: boolean;
  };
  /** Present only when an AI provider is configured and returned a usable structured analysis. */
  aiInsight: {
    documentType: DocumentAnalysis["documentType"];
    primaryDialectGuess: string | null;
    contains: DocumentAnalysis["contains"];
    reasoning: string | null;
  } | null;
}

// Values that look like timestamps, durations, sequence numbers, row IDs, or
// other non-linguistic metadata. Matched case-insensitively against a
// trimmed cell value in isolation — a value that "is" one of these patterns
// (not merely contains digits) is metadata, never linguistic text. This is
// the deterministic guard against bugs like "0s" / "00:01:35" / row indices
// being imported as sentence text — it runs regardless of AI availability.
const METADATA_VALUE_PATTERNS: RegExp[] = [
  /^\d+(\.\d+)?\s*(ms|s|sec|secs|m|min|mins|h|hr|hrs)$/i, // "0s", "6s", "1.5s", "12min"
  /^\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?$/, // "01:24", "00:01:35", "00:01:35,120"
  /^\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}$/, // SRT/VTT cue range
  /^#?\d+$/, // "1", "#42" — bare sequence number / row id
  /^\[\d+\]$/, // "[12]"
  /^r?\d{1,3}$/i, // "r12" row-style ids (short, avoids false-positives on longer alnum)
];

/** True when a single cell value is metadata (timestamp/sequence/id), not linguistic content. */
export function isMetadataValue(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  return METADATA_VALUE_PATTERNS.some((re) => re.test(t));
}

export interface ColumnStats {
  column: string;
  nonEmptyCount: number;
  metadataRatio: number;
  isMetadataLike: boolean;
  arabicRatio: number;
  avgWordCount: number;
  avgCharLength: number;
}

/** Scores every column by its actual sampled VALUES (not header name) so a mislabeled or unlabeled metadata column can never be chosen as linguistic text. */
export function classifyColumns(columns: string[], rows: Record<string, string>[]): Map<string, ColumnStats> {
  const sampleRows = rows.slice(0, 300);
  const stats = new Map<string, ColumnStats>();
  for (const col of columns) {
    const values = sampleRows.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    const metaCount = values.filter(isMetadataValue).length;
    const metadataRatio = values.length ? metaCount / values.length : 0;
    const arabicCount = values.filter(containsArabic).length;
    const totalWords = values.reduce((s, v) => s + v.split(/\s+/).filter(Boolean).length, 0);
    const totalChars = values.reduce((s, v) => s + v.length, 0);
    stats.set(col, {
      column: col,
      nonEmptyCount: values.length,
      metadataRatio,
      // A column is metadata-like when most of its non-empty sampled values
      // match a metadata pattern. Threshold >0.6 tolerates a few stray
      // blanks/outliers without misclassifying genuinely short text columns.
      isMetadataLike: values.length > 0 && metadataRatio > 0.6,
      arabicRatio: values.length ? arabicCount / values.length : 0,
      avgWordCount: values.length ? totalWords / values.length : 0,
      avgCharLength: values.length ? totalChars / values.length : 0,
    });
  }
  return stats;
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
  speaker: ["speaker", "who"],
};

const EXPRESSION_KEYS = ["text", "conceptKey", "meaning", "dialect", "language", "register", "pronunciation", "ipa", "category", "notes"];
const SENTENCE_KEYS = ["text", "meaning", "dialect", "language", "utteranceGroup", "intent", "situation", "register", "category", "pronunciation", "notes", "speaker"];

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

/**
 * Richest non-metadata column by actual content — the fallback used when no
 * header keyword matches, and the override used when a header keyword DOES
 * match but points at a column whose values are metadata (e.g. a column
 * literally named "text" that actually contains timestamps).
 *
 * Arabic-script content is preferred over raw word/char count: an English
 * reference translation is often longer than the terse Arabic original it
 * translates (e.g. a short dialect sentence vs. a verbose English gloss), so
 * ranking by length alone would pick the translation as the "original" text.
 * This platform's original text is Arabic-first; when any candidate column
 * is substantially Arabic, it outranks non-Arabic ones regardless of length.
 */
export function pickRichestColumn(linguisticColumns: string[], columnStats: Map<string, ColumnStats>): string | undefined {
  return [...linguisticColumns]
    .map((c) => columnStats.get(c)!)
    .sort(
      (a, b) =>
        (b.arabicRatio > 0.3 ? 1 : 0) - (a.arabicRatio > 0.3 ? 1 : 0) ||
        b.avgWordCount - a.avgWordCount ||
        b.avgCharLength - a.avgCharLength,
    )[0]?.column;
}

export async function analyzeRows(
  columns: string[],
  rows: Record<string, string>[],
  extraMetadataColumns: string[] = [],
): Promise<ImportAnalysis> {
  const columnStats = classifyColumns(columns, rows);
  const extraMetadataSet = new Set(extraMetadataColumns);
  const metadataColumns = columns.filter((c) => columnStats.get(c)?.isMetadataLike || extraMetadataSet.has(c));
  const linguisticColumns = columns.filter((c) => !metadataColumns.includes(c));

  const richestColumn = pickRichestColumn(linguisticColumns, columnStats);

  const prelimMapping = guessColumnMapping(linguisticColumns, "sentence");
  let textCol = prelimMapping.text ?? richestColumn ?? columns[0] ?? "";
  let textColumnOverridden = false;
  if ((columnStats.get(textCol)?.isMetadataLike || extraMetadataSet.has(textCol)) && richestColumn) {
    textCol = richestColumn;
    textColumnOverridden = true;
  }

  const sample = rows.slice(0, 300).map((r) => (r[textCol] ?? "").trim()).filter(Boolean);
  const avgWords = sample.length
    ? sample.reduce((s, t) => s + t.split(/\s+/).filter(Boolean).length, 0) / sample.length
    : 0;
  const target: "expression" | "sentence" = avgWords > 0 && avgWords <= 2.5 ? "expression" : "sentence";

  const columnMapping = guessColumnMapping(linguisticColumns, target);
  columnMapping.text = textCol;

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
  if (metadataColumns.length) {
    parts.push(`ignored as metadata (not linguistic text): ${metadataColumns.join(", ")}`);
  }
  if (textColumnOverridden) {
    parts.push(`note: the column that looked like the text column actually contained timestamps/IDs, so "${textCol}" was used instead`);
  }

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
      metadataColumns,
      textColumnOverridden,
    },
    aiInsight: null,
  };
}

/**
 * AI-augmented analysis: runs the deterministic analyzeRows guard first,
 * then (only if an AI provider is configured) asks the document-
 * understanding model for a second opinion on column roles and merges any
 * additional metadata columns it identifies (e.g. a speaker-label column
 * that isn't a pure number/timestamp so the deterministic regex guard
 * doesn't catch it). The deterministic guard's own metadata findings are
 * never removed by AI disagreement — AI can only ADD exclusions, never
 * un-exclude a column the deterministic guard already proved is metadata.
 */
export async function analyzeImportJobWithAi(
  columns: string[],
  rows: Record<string, string>[],
  filename: string,
): Promise<ImportAnalysis> {
  const baseline = await analyzeRows(columns, rows);

  const aiInsight = await analyzeDocumentWithAi({
    filename,
    columns,
    sampleRows: rows.slice(0, 15),
    metadataColumnsAlreadyDetected: baseline.detected.metadataColumns,
  });
  if (!aiInsight) return baseline;

  const aiMetadataColumns = aiInsight.columns
    .filter((c) => !c.importAsLinguisticText && ["timestamp", "sequence_id", "speaker", "other_metadata"].includes(c.role))
    .map((c) => c.column);

  const merged = await analyzeRows(columns, rows, aiMetadataColumns);
  merged.aiInsight = {
    documentType: aiInsight.documentType,
    primaryDialectGuess: aiInsight.primaryDialectGuess,
    contains: aiInsight.contains,
    reasoning: aiInsight.reasoning,
  };
  if (aiInsight.reasoning) {
    merged.summary += ` AI notes: ${aiInsight.reasoning}`;
  }

  // Only used as a fallback when deterministic dialect-column matching found
  // nothing (e.g. no dialect column at all, or the file simply doesn't have
  // one) — never overrides an actual deterministic dialect match.
  if (!merged.defaults.dialectId && aiInsight.primaryDialectGuess) {
    const guess = aiInsight.primaryDialectGuess.trim().toLowerCase();
    const dialects = await db.dialectNode.findMany();
    const match = dialects.find(
      (d) => d.name.toLowerCase() === guess || d.slug === guess.replace(/\s+/g, "-") || d.nameAr === aiInsight.primaryDialectGuess,
    );
    if (match) {
      merged.defaults.dialectId = match.id;
      merged.summary += ` AI-suggested dialect: ${match.name} (unconfirmed by column data — verify before importing).`;
    }
  }

  return merged;
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
