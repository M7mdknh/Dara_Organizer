import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

/** Parse an uploaded file buffer into a uniform column/row table. */
export function parseFile(filename: string, buffer: Buffer): ParsedTable {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const columns = json.length ? Object.keys(json[0]) : [];
    return {
      columns,
      rows: json.map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) out[k] = String(v ?? "").trim();
        return out;
      }),
    };
  }
  const text = buffer.toString("utf-8");
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    return parseDelimited(text);
  }
  // TXT / paste: try delimited first; fall back to one-entry-per-line
  if (text.includes(",") || text.includes("\t") || text.includes(";")) {
    const parsed = parseDelimited(text);
    if (parsed.columns.length > 1) return parsed;
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { columns: ["text"], rows: lines.map((l) => ({ text: l })) };
}

function parseDelimited(text: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const columns = result.meta.fields ?? [];
  return {
    columns,
    rows: result.data.map((r) => {
      const out: Record<string, string> = {};
      for (const c of columns) out[c] = String(r[c] ?? "").trim();
      return out;
    }),
  };
}
