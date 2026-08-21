"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { Button, Field, Select, Modal, Spinner } from "@/components/ui";
import type { ImportAnalysis } from "@/domains/imports/analyze";

interface UploadedJob {
  id: string;
  filename: string;
  rowCount: number;
}

interface JobPlan extends UploadedJob {
  analysis: ImportAnalysis | null;
  analyzing: boolean;
  analyzeError: string | null;
}

interface CompletedJob {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  accepted: number;
  matched: number;
  conflicts: number;
  semanticCandidates: number;
  duplicates: number;
  errors: number;
}

type Step = "upload" | "confirm" | "processing" | "done";

export function SimpleUpload({
  onClose,
  onDone,
  onAdvanced,
}: {
  onClose: () => void;
  onDone: () => void;
  onAdvanced: () => void;
}) {
  const lookups = useLookups();
  const [step, setStep] = useState<Step>("upload");
  const [plans, setPlans] = useState<JobPlan[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompletedJob[]>([]);
  const [processingFilename, setProcessingFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const analyzeJob = useCallback(async (job: UploadedJob): Promise<JobPlan> => {
    try {
      const res = await api<{ analysis: ImportAnalysis }>(`/api/imports/${job.id}/analyze`);
      return { ...job, analysis: res.analysis, analyzing: false, analyzeError: null };
    } catch (err) {
      return {
        ...job,
        analysis: null,
        analyzing: false,
        analyzeError: err instanceof Error ? err.message : "Could not analyze this file",
      };
    }
  }, []);

  async function handleUpload(files: FileList | null, text?: string) {
    if (!files?.length && !text?.trim()) return;
    setUploading(true);
    setError(null);
    try {
      let jobs: UploadedJob[];
      if (text?.trim()) {
        const data = await api<{ jobs: UploadedJob[] }>("/api/imports/upload", {
          method: "POST",
          json: { text, name: "Pasted text" },
        });
        jobs = data.jobs;
      } else {
        const form = new FormData();
        for (const f of Array.from(files!)) form.append("files", f);
        const res = await fetch("/api/imports/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        jobs = data.jobs;
      }
      setStep("confirm");
      setPlans(jobs.map((j) => ({ ...j, analysis: null, analyzing: true, analyzeError: null })));
      const analyzed = await Promise.all(jobs.map(analyzeJob));
      setPlans(analyzed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function updateDefaults(id: string, patch: Partial<ImportAnalysis["defaults"]>) {
    setPlans((prev) =>
      prev.map((p) =>
        p.id === id && p.analysis ? { ...p, analysis: { ...p.analysis, defaults: { ...p.analysis.defaults, ...patch } } } : p,
      ),
    );
  }

  async function pollUntilDone(jobId: string, filename: string): Promise<CompletedJob> {
    for (;;) {
      const res = await api<{ item: Omit<CompletedJob, "filename"> }>(`/api/imports/${jobId}`);
      if (res.item.status === "COMPLETED" || res.item.status === "FAILED") return { ...res.item, filename };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const readyPlans = plans.filter((p) => p.analysis && p.analysis.defaults.languageId);
  const canProcess = plans.length > 0 && plans.every((p) => !p.analyzing) && readyPlans.length === plans.length;

  async function runImport() {
    setStep("processing");
    setError(null);
    const outcomes: CompletedJob[] = [];
    for (const plan of plans) {
      if (!plan.analysis) continue;
      setProcessingFilename(plan.filename);
      try {
        const res = await api<{ item?: Omit<CompletedJob, "filename">; queued?: boolean; jobId?: string }>(
          `/api/imports/${plan.id}/process`,
          {
            method: "POST",
            json: { mapping: { target: plan.analysis.target, columns: plan.analysis.columns, defaults: plan.analysis.defaults } },
          },
        );
        if (res.queued) {
          outcomes.push(await pollUntilDone(plan.id, plan.filename));
        } else if (res.item) {
          outcomes.push({ ...res.item, filename: plan.filename });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
        break;
      }
    }
    setResults(outcomes);
    setStep("done");
  }

  return (
    <Modal title="Upload data" onClose={onClose} wide>
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleUpload(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
              dragOver ? "border-accent bg-accent/5" : "border-border"
            }`}
          >
            <p className="text-sm mb-1">Drag and drop files here</p>
            <p className="text-xs text-muted mb-3">XLSX, CSV, or TXT — one or many files at once</p>
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => void handleUpload(e.target.files)}
              className="text-sm mx-auto"
            />
          </div>
          <div>
            <Field label="Or paste text (one entry per line)">
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                rows={5}
                dir="auto"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"الحين\nدحين\nهلأ"}
              />
            </Field>
            <div className="flex justify-end mt-2">
              <Button onClick={() => void handleUpload(null, pasteText)} disabled={!pasteText.trim() || uploading}>
                Use pasted text
              </Button>
            </div>
          </div>
          {uploading && <Spinner />}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="text-center pt-2">
            <button onClick={onAdvanced} className="text-xs text-muted hover:text-foreground underline">
              Need manual column mapping? Switch to advanced upload
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && lookups && (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="border border-border rounded-lg p-4">
              <div className="text-sm font-medium mb-2">{plan.filename}</div>
              {plan.analyzing && (
                <p className="text-sm text-muted flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent inline-block" />
                  Analyzing…
                </p>
              )}
              {plan.analyzeError && <p className="text-sm text-red-600">{plan.analyzeError}</p>}
              {plan.analysis && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">{plan.analysis.summary}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Language">
                      <Select
                        className="w-full"
                        value={plan.analysis.defaults.languageId ?? ""}
                        onChange={(e) => updateDefaults(plan.id, { languageId: e.target.value || null })}
                      >
                        <option value="">Select…</option>
                        {lookups.languages.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Default dialect">
                      <Select
                        className="w-full"
                        value={plan.analysis.defaults.dialectId ?? ""}
                        onChange={(e) => updateDefaults(plan.id, { dialectId: e.target.value || null })}
                      >
                        <option value="">None</option>
                        {dialectOptions(lookups.dialects).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {!plan.analysis.defaults.languageId && (
                    <p className="text-xs text-amber-600">Pick a language before importing this file.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between items-center">
            <button onClick={onAdvanced} className="text-xs text-muted hover:text-foreground underline">
              Switch to advanced column mapping
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={runImport} disabled={!canProcess}>
                Import {plans.length > 1 ? `${plans.length} files` : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="py-10 text-center">
          <Spinner />
          <p className="text-sm text-muted mt-2">Processing {processingFilename}…</p>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <h3 className="font-medium">Upload complete</h3>
          {results.map((r) => (
            <div key={r.id} className="border border-border rounded-lg p-3">
              <div className="text-sm font-medium mb-2">{r.filename}</div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-green-600">{r.accepted.toLocaleString()} added</span>
                <span className="text-muted">{r.matched.toLocaleString()} already existed</span>
                {r.conflicts > 0 && (
                  <span className="text-amber-600">{r.conflicts.toLocaleString()} need your review</span>
                )}
                {r.duplicates > 0 && <span className="text-muted">{r.duplicates.toLocaleString()} duplicates skipped</span>}
                {r.errors > 0 && <span className="text-red-600">{r.errors.toLocaleString()} errors</span>}
              </div>
            </div>
          ))}
          {results.some((r) => r.conflicts > 0) && (
            <p className="text-sm text-amber-600">
              Some entries overlap with existing data — check the Review page to decide what to do with them.
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
