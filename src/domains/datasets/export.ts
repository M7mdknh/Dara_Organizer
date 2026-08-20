import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";

/**
 * Export a built dataset version as JSONL or CSV. Standard schema includes
 * stable ids and provenance/quality fields; lean schema is training-oriented.
 */

interface ExportRow {
  id: string;
  split: string;
  text: string;
  dialect: string | null;
  language: string;
  meaning: string | null;
  intent: string | null;
  situation: string | null;
  register: string | null;
  utterance_group: string | null;
  quality: string;
  verification: string;
  origin: string;
  source: string | null;
  training_eligibility: string;
  naturalness: string;
  commonness: string;
  pronunciation: string | null;
}

export async function exportRows(datasetId: string, split?: string): Promise<{ rows: ExportRow[]; dataset: { name: string; version: number; exportSchema: string } }> {
  const dataset = await db.datasetVersion.findUnique({ where: { id: datasetId } });
  if (!dataset) throw new ApiError(404, "Dataset not found");

  const records = await db.datasetRecord.findMany({
    where: { datasetId, ...(split ? { split: split as never } : {}) },
  });
  const sentenceIds = records.filter((r) => r.entityType === "sentence").map((r) => r.entityId);
  const conversationIds = records.filter((r) => r.entityType === "conversation").map((r) => r.entityId);
  const splitById = new Map(records.map((r) => [r.entityId, r.split]));

  const rows: ExportRow[] = [];

  if (sentenceIds.length) {
    for (let i = 0; i < sentenceIds.length; i += 2000) {
      const batch = await db.sentence.findMany({
        where: { id: { in: sentenceIds.slice(i, i + 2000) } },
        include: {
          dialect: true,
          language: true,
          intent: true,
          situation: true,
          register: true,
          utteranceGroup: true,
          source: true,
          pronunciations: { take: 1 },
        },
      });
      for (const s of batch) {
        rows.push({
          id: s.id,
          split: splitById.get(s.id) ?? "TRAIN",
          text: s.textOriginal,
          dialect: s.dialect?.name ?? null,
          language: s.language.code,
          meaning: s.meaning,
          intent: s.intent?.name ?? null,
          situation: s.situation?.name ?? null,
          register: s.register?.name ?? null,
          utterance_group: s.utteranceGroup?.name ?? null,
          quality: s.quality,
          verification: s.verification,
          origin: s.origin,
          source: s.source?.name ?? null,
          training_eligibility: s.training,
          naturalness: s.naturalness,
          commonness: s.commonness,
          pronunciation: s.pronunciations[0]?.arabicPhonetic ?? null,
        });
      }
    }
  }

  if (conversationIds.length) {
    for (let i = 0; i < conversationIds.length; i += 500) {
      const batch = await db.conversation.findMany({
        where: { id: { in: conversationIds.slice(i, i + 500) } },
        include: { dialect: true, situation: true, source: true, turns: { orderBy: { orderIndex: "asc" } } },
      });
      for (const c of batch) {
        rows.push({
          id: c.id,
          split: splitById.get(c.id) ?? "TRAIN",
          text: c.turns.map((t) => `${t.speaker}: ${t.textOriginal}`).join("\n"),
          dialect: c.dialect?.name ?? null,
          language: "ar",
          meaning: c.title,
          intent: null,
          situation: c.situation?.name ?? null,
          register: null,
          utterance_group: null,
          quality: c.quality,
          verification: c.verification,
          origin: c.origin,
          source: c.source?.name ?? null,
          training_eligibility: c.training,
          naturalness: "UNKNOWN",
          commonness: "UNKNOWN",
          pronunciation: null,
        });
      }
    }
  }

  return { rows, dataset: { name: dataset.name, version: dataset.version, exportSchema: dataset.exportSchema } };
}

const LEAN_FIELDS: (keyof ExportRow)[] = ["split", "text", "dialect", "language", "meaning", "intent"];

export function toJsonl(rows: ExportRow[], schema: string): string {
  return (
    rows
      .map((r) => {
        if (schema === "lean") {
          const lean: Record<string, unknown> = {};
          for (const f of LEAN_FIELDS) lean[f] = r[f];
          return JSON.stringify(lean);
        }
        return JSON.stringify(r);
      })
      .join("\n") + "\n"
  );
}

export function toCsv(rows: ExportRow[], schema: string): string {
  const fields = schema === "lean" ? LEAN_FIELDS : (Object.keys(rows[0] ?? { id: "" }) as (keyof ExportRow)[]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [fields.join(",")];
  for (const r of rows) lines.push(fields.map((f) => escape(r[f])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel renders Arabic correctly
}
