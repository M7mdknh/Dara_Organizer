"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { Button, Field, Select, Modal, Spinner, Badge } from "@/components/ui";

interface UploadJob {
  id: string;
  filename: string;
  columns: string[];
  rowCount: number;
  preview: Record<string, string>[];
}

interface CompletedJob {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  accepted: number;
  matched: number;
  conflicts: number;
  semanticCandidates: number;
  duplicates: number;
  errors: number;
}

const EXPRESSION_FIELDS = [
  { key: "text", label: "Expression text", required: true },
  { key: "conceptKey", label: "Concept key (e.g. TIME_NOW)" },
  { key: "meaning", label: "Meaning / gloss" },
  { key: "dialect", label: "Dialect (name)" },
  { key: "language", label: "Language (code)" },
  { key: "commonness", label: "Commonness" },
  { key: "register", label: "Register" },
  { key: "pronunciation", label: "Pronunciation (Arabic phonetic)" },
  { key: "ipa", label: "Pronunciation (IPA)" },
  { key: "category", label: "Category" },
  { key: "notes", label: "Notes" },
] as const;

const SENTENCE_FIELDS = [
  { key: "text", label: "Sentence text", required: true },
  { key: "meaning", label: "Meaning (English/other)" },
  { key: "dialect", label: "Dialect (name)" },
  { key: "language", label: "Language (code)" },
  { key: "utteranceGroup", label: "Utterance group name" },
  { key: "intent", label: "Intent" },
  { key: "situation", label: "Situation" },
  { key: "register", label: "Register" },
  { key: "category", label: "Category" },
  { key: "pronunciation", label: "Pronunciation (Arabic phonetic)" },
  { key: "notes", label: "Notes" },
] as const;

type Step = "upload" | "map" | "processing" | "done";

export function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const lookups = useLookups();
  const [step, setStep] = useState<Step>("upload");
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [activeJobIdx, setActiveJobIdx] = useState(0);
  const [target, setTarget] = useState<"expression" | "sentence">("sentence");
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState({ languageId: "", dialectId: "", quality: "CANDIDATE", training: "UNDECIDED" });
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompletedJob[]>([]);
  const [processingIdx, setProcessingIdx] = useState(0);
  const [progress, setProgress] = useState<{ processedRows: number; totalRows: number } | null>(null);

  async function uploadFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/imports/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setJobs(data.jobs);
      autoMapColumns(data.jobs[0].columns);
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadPaste() {
    if (!pasteText.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/imports/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, name: "Pasted text" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setJobs(data.jobs);
      autoMapColumns(data.jobs[0].columns);
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function autoMapColumns(cols: string[]) {
    const guess: Record<string, string> = {};
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    for (const col of cols) {
      const n = norm(col);
      if (["text", "expression", "sentence", "arabic", "word"].some((k) => n.includes(k))) guess.text = col;
      if (["meaning", "gloss", "english", "translation"].some((k) => n.includes(k))) guess.meaning = col;
      if (n.includes("dialect")) guess.dialect = col;
      if (n.includes("language") || n === "lang") guess.language = col;
      if (n.includes("concept")) guess.conceptKey = col;
      if (n.includes("pronunciation") || n.includes("phonetic")) guess.pronunciation = col;
      if (n.includes("category")) guess.category = col;
      if (n.includes("note")) guess.notes = col;
    }
    setColumns(guess);
  }

  async function pollUntilDone(jobId: string): Promise<CompletedJob> {
    for (;;) {
      const res = await api<{ item: CompletedJob & { status: string; totalRows: number; processedRows: number } }>(`/api/imports/${jobId}`);
      setProgress({ processedRows: res.item.processedRows, totalRows: res.item.totalRows });
      if (res.item.status === "COMPLETED" || res.item.status === "FAILED") return res.item;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  async function runImport() {
    setStep("processing");
    setError(null);
    const outcomes: CompletedJob[] = [];
    for (let i = 0; i < jobs.length; i++) {
      setProcessingIdx(i);
      setProgress(null);
      try {
        const res = await api<{ item?: CompletedJob; queued?: boolean; jobId?: string }>(`/api/imports/${jobs[i].id}/process`, {
          method: "POST",
          json: {
            mapping: { target, columns, defaults: { ...defaults, dialectId: defaults.dialectId || null } },
          },
        });
        if (res.queued) {
          outcomes.push(await pollUntilDone(jobs[i].id));
        } else if (res.item) {
          outcomes.push(res.item);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
        break;
      }
    }
    setResults(outcomes);
    setStep("done");
  }

  const fields = target === "expression" ? EXPRESSION_FIELDS : SENTENCE_FIELDS;
  const activeJob = jobs[activeJobIdx];
  const canProceed = defaults.languageId && columns.text;

  return (
    <Modal title="Import files" onClose={onClose} wide>
      {step === "upload" && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted mb-3">Upload one or more XLSX, CSV, or TXT files</p>
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              className="text-sm"
            />
          </div>
          <div>
            <Field label="Or paste text (one entry per line, or delimited)">
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                rows={6}
                dir="auto"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"الحين\nدحين\nهلأ"}
              />
            </Field>
            <div className="flex justify-end mt-2">
              <Button onClick={uploadPaste} disabled={!pasteText.trim() || uploading}>Use pasted text</Button>
            </div>
          </div>
          {uploading && <Spinner />}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === "map" && lookups && activeJob && (
        <div className="space-y-4">
          {jobs.length > 1 && (
            <div className="flex gap-1 text-xs">
              {jobs.map((j, i) => (
                <button
                  key={j.id}
                  onClick={() => setActiveJobIdx(i)}
                  className={`px-2 py-1 rounded ${i === activeJobIdx ? "bg-accent text-accent-fg" : "bg-foreground/10"}`}
                >
                  {j.filename}
                </button>
              ))}
            </div>
          )}
          <p className="text-sm text-muted">
            {activeJob.filename} — {activeJob.rowCount.toLocaleString()} rows detected. Map columns once; the same mapping applies to all files in this batch.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Import as">
              <Select className="w-full" value={target} onChange={(e) => setTarget(e.target.value as "expression" | "sentence")}>
                <option value="sentence">Sentences</option>
                <option value="expression">Words & expressions</option>
              </Select>
            </Field>
            <Field label="Default language">
              <Select className="w-full" value={defaults.languageId} onChange={(e) => setDefaults((d) => ({ ...d, languageId: e.target.value }))}>
                <option value="">Select…</option>
                {lookups.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Default dialect (used if no dialect column matches)">
              <Select className="w-full" value={defaults.dialectId} onChange={(e) => setDefaults((d) => ({ ...d, dialectId: e.target.value }))}>
                <option value="">None</option>
                {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
            <Field label="Default quality tier">
              <Select className="w-full" value={defaults.quality} onChange={(e) => setDefaults((d) => ({ ...d, quality: e.target.value }))}>
                {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => <option key={q} value={q}>{q}</option>)}
              </Select>
            </Field>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Column mapping</h4>
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label + ("required" in f && f.required ? " *" : "")}>
                  <Select className="w-full" value={columns[f.key] ?? ""} onChange={(e) => setColumns((c) => ({ ...c, [f.key]: e.target.value }))}>
                    <option value="">— Not mapped —</option>
                    {activeJob.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Preview (first {activeJob.preview.length} rows)</h4>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-foreground/5">
                    {activeJob.columns.map((c) => <th key={c} className="p-1.5 text-start whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {activeJob.preview.map((row, i) => (
                    <tr key={i} className="border-t border-border/50">
                      {activeJob.columns.map((c) => <td key={c} className="p-1.5 whitespace-nowrap max-w-40 truncate" dir="auto">{row[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={runImport} disabled={!canProceed}>Import {jobs.length > 1 ? `${jobs.length} files` : ""}</Button>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="py-10 text-center">
          <Spinner />
          <p className="text-sm text-muted mt-2">
            Processing {jobs[processingIdx]?.filename} ({processingIdx + 1} of {jobs.length})…
          </p>
          {progress && progress.totalRows > 0 && (
            <div className="mt-3 max-w-sm mx-auto">
              <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((progress.processedRows / progress.totalRows) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {progress.processedRows.toLocaleString()} / {progress.totalRows.toLocaleString()} rows (
                {Math.round((progress.processedRows / progress.totalRows) * 100)}%)
              </p>
            </div>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <h3 className="font-medium">Import summary</h3>
          {results.map((r, i) => (
            <div key={r.id} className="border border-border rounded-lg p-3">
              <div className="text-sm font-medium mb-2">{jobs[i]?.filename}</div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-green-600">{r.accepted.toLocaleString()} accepted</span>
                <span className="text-muted">{r.matched.toLocaleString()} matched existing</span>
                {r.conflicts > 0 && (
                  <span className="text-amber-600">
                    {r.conflicts.toLocaleString()} sent to review
                    {r.semanticCandidates > 0 ? ` (${r.semanticCandidates} via AI semantic match)` : ""}
                  </span>
                )}
                {r.duplicates > 0 && <span className="text-muted">{r.duplicates.toLocaleString()} duplicate rows skipped</span>}
                {r.errors > 0 && <span className="text-red-600">{r.errors.toLocaleString()} errors</span>}
              </div>
            </div>
          ))}
          {results.some((r) => r.conflicts > 0) && (
            <p className="text-sm text-amber-600">
              Some rows overlap semantically with existing data — they were created and sent to the <Badge value="PENDING" label="Review Inbox" /> for a human decision.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
