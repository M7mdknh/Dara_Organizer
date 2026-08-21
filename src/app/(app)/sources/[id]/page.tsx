"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Button } from "@/components/ui";

interface SourceDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  objectKey: string | null;
  importJobs: { id: string; status: string; filename: string | null; accepted: number; matched: number; conflicts: number; duplicates: number; errors: number; totalRows: number; createdAt: string }[];
  expressions: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  sentences: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  _count: { expressions: number; sentences: number; conversations: number; concepts: number };
}

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: SourceDetail }>(`/api/sources/${id}`);
  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Source not found" />;
  const s = data.item;

  return (
    <div>
      <PageHeader title={s.name} subtitle={s.description ?? undefined} actions={<Badge value="TYPE" label={s.type} />} />

      {s.objectKey && <ReprocessPanel sourceId={s.id} importJobs={s.importJobs} onDone={refetch} />}

      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-muted mb-3">Import history</h3>
        {s.importJobs.length === 0 ? (
          <EmptyState title="No import jobs" hint="Manually created source" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted text-start">
                <th className="p-1.5 text-start">File</th>
                <th className="p-1.5 text-start">Status</th>
                <th className="p-1.5 text-start">Rows</th>
                <th className="p-1.5 text-start">Accepted</th>
                <th className="p-1.5 text-start">Matched</th>
                <th className="p-1.5 text-start">Conflicts</th>
                <th className="p-1.5 text-start">Errors</th>
                <th className="p-1.5 text-start">Date</th>
              </tr>
            </thead>
            <tbody>
              {s.importJobs.map((j) => (
                <tr key={j.id} className="border-t border-border/50">
                  <td className="p-1.5">{j.filename}</td>
                  <td className="p-1.5"><Badge value={j.status} /></td>
                  <td className="p-1.5">{j.totalRows}</td>
                  <td className="p-1.5 text-green-600">{j.accepted}</td>
                  <td className="p-1.5">{j.matched}</td>
                  <td className="p-1.5 text-amber-600">{j.conflicts}</td>
                  <td className="p-1.5 text-red-600">{j.errors}</td>
                  <td className="p-1.5 text-xs text-muted">{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Expressions from this source ({s._count.expressions})</h3>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {s.expressions.map((e) => (
              <Link key={e.id} href={`/words/${e.id}`} className="flex justify-between py-1 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <ArabicText text={e.textOriginal} />
                <span className="text-xs text-muted">{e.dialect?.name}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Sentences from this source ({s._count.sentences})</h3>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {s.sentences.map((sent) => (
              <Link key={sent.id} href={`/sentences/${sent.id}`} className="flex justify-between py-1 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <ArabicText text={sent.textOriginal} />
                <span className="text-xs text-muted">{sent.dialect?.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReprocessAnalysis {
  target: string;
  summary: string;
  defaults: { languageId: string | null; dialectId: string | null; quality: string; training: string };
  columns: Record<string, string>;
}

/**
 * Re-runs the immutable stored original through the current (fixed)
 * understanding/extraction pipeline without re-uploading, then offers to
 * archive the old job's derived records once the new run looks good — see
 * /api/sources/[id]/reprocess and /api/sources/[id]/archive-import.
 */
function ReprocessPanel({
  sourceId,
  importJobs,
  onDone,
}: {
  sourceId: string;
  importJobs: { id: string; filename: string | null; createdAt: string }[];
  onDone: () => void;
}) {
  const [step, setStep] = useState<"idle" | "analyzing" | "confirm" | "processing" | "done">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReprocessAnalysis | null>(null);
  const [result, setResult] = useState<{ accepted: number; matched: number; conflicts: number } | null>(null);
  const [archiveJobId, setArchiveJobId] = useState("");
  const [archiveResult, setArchiveResult] = useState<{ archivedExpressions: number; archivedSentences: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStep("analyzing");
    setError(null);
    try {
      const up = await api<{ job: { id: string } }>(`/api/sources/${sourceId}/reprocess`, { method: "POST" });
      setJobId(up.job.id);
      const an = await api<{ analysis: ReprocessAnalysis }>(`/api/imports/${up.job.id}/analyze`);
      setAnalysis(an.analysis);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reprocess failed");
      setStep("idle");
    }
  }

  async function confirm() {
    if (!jobId || !analysis) return;
    setStep("processing");
    setError(null);
    try {
      const res = await api<{ item?: { accepted: number; matched: number; conflicts: number }; queued?: boolean }>(
        `/api/imports/${jobId}/process`,
        { method: "POST", json: { mapping: { target: analysis.target, columns: analysis.columns, defaults: analysis.defaults } } },
      );
      if (res.item) setResult(res.item);
      setStep("done");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
      setStep("confirm");
    }
  }

  async function archiveOld() {
    if (!archiveJobId) return;
    try {
      const res = await api<{ archivedExpressions: number; archivedSentences: number }>(`/api/sources/${sourceId}/archive-import`, {
        method: "POST",
        json: { importJobId: archiveJobId },
      });
      setArchiveResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-muted">Reprocess from stored original</h3>
        {step === "idle" && <Button variant="secondary" onClick={start}>Reprocess Source</Button>}
      </div>

      {step === "analyzing" && <p className="text-sm text-muted">Re-reading the stored file and analyzing it…</p>}

      {step === "confirm" && analysis && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{analysis.summary}</p>
          <div className="flex gap-2">
            <Button onClick={confirm}>Organize Data</Button>
          </div>
        </div>
      )}

      {step === "processing" && <p className="text-sm text-muted">Processing…</p>}

      {step === "done" && (
        <div className="space-y-3">
          {result && (
            <p className="text-sm">
              <span className="text-green-600">{result.accepted} accepted</span> · {result.matched} matched ·{" "}
              {result.conflicts > 0 && <span className="text-amber-600">{result.conflicts} sent to review</span>}
            </p>
          )}
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted mb-2">
              Optionally archive the records a previous (bad) import job produced from this source. Only unverified records are archived — anything a human has verified is left untouched, and nothing is deleted.
            </p>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                value={archiveJobId}
                onChange={(e) => setArchiveJobId(e.target.value)}
              >
                <option value="">Select old import job…</option>
                {importJobs
                  .filter((j) => j.id !== jobId)
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.filename ?? j.id} — {new Date(j.createdAt).toLocaleDateString()}
                    </option>
                  ))}
              </select>
              <Button variant="secondary" disabled={!archiveJobId} onClick={archiveOld}>
                Archive its records
              </Button>
            </div>
            {archiveResult && (
              <p className="text-xs text-muted mt-2">
                Archived {archiveResult.archivedExpressions} expression(s) and {archiveResult.archivedSentences} sentence(s).
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
