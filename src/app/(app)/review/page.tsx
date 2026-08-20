"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Button, Select, Field } from "@/components/ui";

interface CandidateConcept {
  conceptId: string;
  key: string;
  gloss: string;
  similarity: number;
  rank: number;
  existingExpressions: string[];
}

interface SemanticEvidence {
  contextAvailable: boolean;
  candidates: CandidateConcept[];
  modelDecision: "SAME" | "RELATED" | "DIFFERENT" | "UNCERTAIN" | null;
  modelReason: string | null;
  chosenConceptId: string | null;
  provider: string | null;
  model: string | null;
  escalated: boolean;
  adjudicationProvider: string | null;
  adjudicationModel: string | null;
}

interface ReviewItem {
  id: string;
  type: string;
  title: string;
  payload: {
    candidate?: { id: string; text: string; dialectId: string | null };
    competing?: string[];
    conceptId?: string;
    isMock?: boolean;
    provider?: string;
    enrichmentType?: string;
    suggestion?: unknown;
    semanticEvidence?: SemanticEvidence;
  };
  entityType: string | null;
  entityId: string | null;
  candidateEntityId: string | null;
  createdAt: string;
}

interface ExpressionInfo {
  id: string;
  textOriginal: string;
  dialect: { name: string } | null;
  language: { name: string };
  concepts: { concept: { key: string; gloss: string } }[];
}

const RESOLUTIONS = [
  { value: "APPROVED", label: "Approve as-is" },
  { value: "ADDED_SYNONYM", label: "Add as synonym" },
  { value: "ADDED_VARIANT", label: "Add as regional variant" },
  { value: "ADDED_DIALECT_EQUIVALENT", label: "Add as dialect equivalent" },
  { value: "DIFFERENT_MEANING", label: "Different meaning (detach concept)" },
  { value: "DIFFERENT_DIALECT", label: "Different dialect" },
  { value: "REPLACED", label: "Replace the existing expression" },
  { value: "REJECTED", label: "Reject" },
  { value: "DISMISSED", label: "Dismiss (no action)" },
];

export default function ReviewInboxPage() {
  const lookups = useLookups();
  const [type, setType] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const { data, loading, refetch } = useApi<{
    items: ReviewItem[];
    countsByType: Record<string, number>;
    expressions: Record<string, ExpressionInfo>;
  }>(`/api/review${type ? `?type=${type}` : ""}`);

  if (loading || !data) return <Spinner />;

  const ordered = [...data.items].sort((a, b) => Number(skipped.has(a.id)) - Number(skipped.has(b.id)));
  const activeId = ordered.find((i) => !skipped.has(i.id))?.id ?? ordered[0]?.id;

  function skip(id: string) {
    setSkipped((s) => new Set(s).add(id));
  }

  return (
    <div>
      <PageHeader
        title="Review"
        subtitle={data.items.length > 0 ? `${data.items.length} item${data.items.length === 1 ? "" : "s"} need a decision` : "Nothing needs your attention"}
      />

      {data.items.length === 0 ? (
        <EmptyState title="Review is empty" hint="Uploaded items that clearly overlap with existing data land here for a human decision" />
      ) : (
        <>
          <p className="text-xs text-muted mb-3">
            Shortcuts: <kbd className="px-1 rounded bg-foreground/10">1</kbd> same meaning ·{" "}
            <kbd className="px-1 rounded bg-foreground/10">2</kbd> different meaning ·{" "}
            <kbd className="px-1 rounded bg-foreground/10">3</kbd> edit ·{" "}
            <kbd className="px-1 rounded bg-foreground/10">4</kbd> skip
          </p>
          <div className="space-y-3">
            {ordered.map((item) =>
              item.payload.semanticEvidence ? (
                <SemanticCandidateCard
                  key={item.id}
                  item={item}
                  isActive={item.id === activeId}
                  onResolved={refetch}
                  onSkip={() => skip(item.id)}
                />
              ) : (
                <ReviewCard
                  key={item.id}
                  item={item}
                  expressions={data.expressions}
                  dialects={lookups?.dialects ?? []}
                  isActive={item.id === activeId}
                  onResolved={refetch}
                  onSkip={() => skip(item.id)}
                />
              ),
            )}
          </div>
          <div className="mt-6">
            <button
              onClick={() => setShowAdvancedFilter((s) => !s)}
              className="text-xs text-muted hover:text-foreground underline"
            >
              {showAdvancedFilter ? "Hide" : "Show"} advanced filter
            </button>
            {showAdvancedFilter && (
              <div className="mt-2">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">All types ({data.items.length})</option>
                  {Object.entries(data.countsByType).map(([t, c]) => (
                    <option key={t} value={t}>{t.replaceAll("_", " ")} ({c})</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function useReviewShortcuts(isActive: boolean, handlers: { same: () => void; different: () => void; edit: () => void; skip: () => void }) {
  useEffect(() => {
    if (!isActive) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "1") handlers.same();
      else if (e.key === "2") handlers.different();
      else if (e.key === "3") handlers.edit();
      else if (e.key === "4") handlers.skip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);
}

/** Review card for AI-suggested concept matches from the semantic matching cascade (pgvector + LLM judgment). */
function SemanticCandidateCard({
  item,
  isActive,
  onResolved,
  onSkip,
}: {
  item: ReviewItem;
  isActive: boolean;
  onResolved: () => void;
  onSkip: () => void;
}) {
  const ev = item.payload.semanticEvidence!;
  const candidate = item.payload.candidate;
  const [selectedConceptId, setSelectedConceptId] = useState(ev.chosenConceptId ?? ev.candidates[0]?.conceptId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const topCandidate = ev.candidates[0];

  async function resolve(resolution: string) {
    setBusy(true);
    try {
      await api(`/api/review/${item.id}`, {
        method: "POST",
        json: { resolution, note: note || null, targetConceptId: resolution === "ADDED_TO_CONCEPT" ? selectedConceptId : null },
      });
      onResolved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve");
    } finally {
      setBusy(false);
    }
  }

  useReviewShortcuts(isActive, {
    same: () => topCandidate && resolve("ADDED_TO_CONCEPT"),
    different: () => resolve("DISMISSED"),
    edit: () => setEditing(true),
    skip: onSkip,
  });

  return (
    <div className={`card p-4 ${isActive ? "ring-2 ring-accent/40" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{item.title}</h3>
        {ev.escalated && <Badge value="PENDING" label="AI double-checked this" />}
      </div>

      {candidate && (
        <div className="border border-accent/40 bg-accent/5 rounded-lg p-3 mb-3">
          <div className="text-xs text-muted mb-1">New entry</div>
          <ArabicText text={candidate.text} className="text-lg font-medium" />
        </div>
      )}

      {topCandidate && (
        <p className="text-sm text-muted mb-3">
          Looks like it might mean the same as <span className="text-foreground font-medium">{topCandidate.gloss}</span>
          {topCandidate.existingExpressions[0] && (
            <>
              {" "}
              (existing: <ArabicText text={topCandidate.existingExpressions[0]} />)
            </>
          )}
          .
        </p>
      )}

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || !topCandidate} onClick={() => resolve("ADDED_TO_CONCEPT")}>
            Same meaning <kbd className="ms-1.5 text-[10px] opacity-60">1</kbd>
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => resolve("DISMISSED")}>
            Different meaning <kbd className="ms-1.5 text-[10px] opacity-60">2</kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
            Edit <kbd className="ms-1.5 text-[10px] opacity-60">3</kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onSkip}>
            Skip <kbd className="ms-1.5 text-[10px] opacity-60">4</kbd>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {ev.modelReason && (
            <div className="text-sm text-muted border-s-2 border-border ps-3">
              <span className="font-medium text-foreground">AI reasoning: </span>
              {ev.modelReason}
              {ev.contextAvailable && <span className="text-xs ms-2">(used sentence context)</span>}
            </div>
          )}
          <div className="text-xs text-muted mb-1.5">Candidate concepts, ranked by similarity</div>
          <div className="space-y-2">
            {ev.candidates.length === 0 && <p className="text-sm text-muted">No candidates met the similarity threshold.</p>}
            {ev.candidates.map((c) => (
              <label
                key={c.conceptId}
                className={`flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer ${selectedConceptId === c.conceptId ? "border-accent bg-accent/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={selectedConceptId === c.conceptId}
                  onChange={() => setSelectedConceptId(c.conceptId)}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs bg-foreground/10 rounded px-1.5 py-0.5">{c.key}</span>
                    <span className="text-xs text-muted">similarity {(c.similarity * 100).toFixed(0)}% · rank {c.rank}</span>
                  </div>
                  <div className="text-sm mt-1">{c.gloss}</div>
                  {c.existingExpressions.length > 0 && (
                    <div className="text-xs text-muted mt-1">
                      Existing: {c.existingExpressions.map((e, i) => <ArabicText key={i} text={e} className="me-2" />)}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button variant="secondary" onClick={() => setEditing(false)}>Back</Button>
            <Button variant="secondary" disabled={busy} onClick={() => resolve("DISMISSED")}>Not related — dismiss</Button>
            <Button disabled={busy || !selectedConceptId} onClick={() => resolve("ADDED_TO_CONCEPT")}>
              {busy ? "Applying…" : "Link to this concept"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  item,
  expressions,
  dialects,
  isActive,
  onResolved,
  onSkip,
}: {
  item: ReviewItem;
  expressions: Record<string, ExpressionInfo>;
  dialects: { id: string; name: string; nameAr?: string | null; slug: string; parentId: string | null; enabled: boolean; sortOrder: number }[];
  isActive: boolean;
  onResolved: () => void;
  onSkip: () => void;
}) {
  const [resolution, setResolution] = useState("");
  const [newDialectId, setNewDialectId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const candidateId = item.entityId ?? item.payload.candidate?.id;
  const candidate = candidateId ? expressions[candidateId] : null;
  const competingId = item.candidateEntityId ?? item.payload.competing?.[0];
  const competing = competingId ? expressions[competingId] : null;

  async function resolve(res: string) {
    setBusy(true);
    try {
      await api(`/api/review/${item.id}`, {
        method: "POST",
        json: { resolution: res, note: note || null, newDialectId: newDialectId || null },
      });
      onResolved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve");
    } finally {
      setBusy(false);
    }
  }

  useReviewShortcuts(isActive && item.type !== "AI_SUGGESTION", {
    same: () => resolve("ADDED_SYNONYM"),
    different: () => resolve("DIFFERENT_MEANING"),
    edit: () => setEditing(true),
    skip: onSkip,
  });

  if (item.type === "AI_SUGGESTION") {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{item.title}</h3>
          {item.payload.isMock && <Badge value="AI" label="MOCK — dev only" />}
        </div>
        <pre className="text-xs bg-foreground/5 rounded p-2 overflow-x-auto max-h-40">{JSON.stringify(item.payload.suggestion, null, 2)}</pre>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={() => resolve("DISMISSED")} disabled={busy}>Dismiss</Button>
          <Button onClick={() => resolve("APPROVED")} disabled={busy}>Acknowledge</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-4 ${isActive ? "ring-2 ring-accent/40" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">{item.title}</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <div className="border border-accent/40 bg-accent/5 rounded-lg p-3">
          <div className="text-xs text-muted mb-1">New entry</div>
          {candidate ? (
            <>
              <ArabicText text={candidate.textOriginal} className="text-lg font-medium" />
              <div className="text-xs text-muted mt-1">{candidate.dialect?.name ?? candidate.language.name}</div>
              {candidate.concepts.map((c) => (
                <div key={c.concept.key} className="text-xs text-muted">{c.concept.gloss}</div>
              ))}
            </>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
        <div className="border border-border rounded-lg p-3">
          <div className="text-xs text-muted mb-1">Existing entry</div>
          {competing ? (
            <>
              <Link href={`/words/${competing.id}`} target="_blank">
                <ArabicText text={competing.textOriginal} className="text-lg font-medium hover:text-accent" />
              </Link>
              <div className="text-xs text-muted mt-1">{competing.dialect?.name ?? competing.language.name}</div>
            </>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => resolve("ADDED_SYNONYM")}>
            Same meaning <kbd className="ms-1.5 text-[10px] opacity-60">1</kbd>
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => resolve("DIFFERENT_MEANING")}>
            Different meaning <kbd className="ms-1.5 text-[10px] opacity-60">2</kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
            Edit <kbd className="ms-1.5 text-[10px] opacity-60">3</kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onSkip}>
            Skip <kbd className="ms-1.5 text-[10px] opacity-60">4</kbd>
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-2 items-end">
          <Field label="Resolution">
            <Select className="w-full" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="">Choose action…</option>
              {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          {resolution === "DIFFERENT_DIALECT" && (
            <Field label="New dialect">
              <Select className="w-full" value={newDialectId} onChange={(e) => setNewDialectId(e.target.value)}>
                <option value="">Select…</option>
                {dialectOptions(dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Note (optional)">
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Back</Button>
            <Button
              disabled={!resolution || busy || (resolution === "DIFFERENT_DIALECT" && !newDialectId)}
              onClick={() => resolve(resolution)}
            >
              {busy ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
