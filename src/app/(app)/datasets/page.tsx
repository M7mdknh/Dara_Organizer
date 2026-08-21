"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, EmptyState, Input, Button, Select, Field } from "@/components/ui";

interface DatasetRow {
  id: string;
  name: string;
  version: number;
  status: string;
  filters: Record<string, unknown>;
  counts: { TRAIN?: number; VALIDATION?: number; TEST?: number } | null;
  createdBy: { name: string } | null;
  createdAt: string;
  _count: { records: number };
}

const QUALITY_PRESETS = {
  verified: ["GOLD", "SILVER"],
  everything: ["GOLD", "SILVER", "REFERENCE", "CANDIDATE"],
};

const MEANING_CENTERED_TYPES = ["concept-lexicon", "sentence-equivalents", "conversation-training", "chat-finetune"] as const;

export default function DatasetsPage() {
  const { data, loading, refetch } = useApi<{ items: DatasetRow[] }>("/api/datasets");
  const lookups = useLookups();

  const [name, setName] = useState("");
  const [entity, setEntity] = useState<
    "sentence" | "conversation" | "concept-lexicon" | "sentence-equivalents" | "conversation-training" | "chat-finetune"
  >("sentence-equivalents");
  const [dialectId, setDialectId] = useState("");
  const [qualityPreset, setQualityPreset] = useState<"verified" | "everything">("verified");
  const [format, setFormat] = useState<"jsonl" | "csv">("jsonl");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [verification, setVerification] = useState("");
  const [training, setTraining] = useState("");
  const [train, setTrain] = useState(80);
  const [validation, setValidation] = useState(10);
  const [test, setTest] = useState(10);
  const [groupBy, setGroupBy] = useState<"utteranceGroup" | "none">("utteranceGroup");
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filters = {
    entity,
    dialectId: dialectId || null,
    quality: QUALITY_PRESETS[qualityPreset],
    verification: verification || null,
    training: training || null,
  };

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ preview: { count: number | null } }>("/api/datasets", {
        method: "POST",
        json: { name: name || "preview", filters, splitStrategy: { train: 1, validation: 0, test: 0, seed: 1, groupBy }, previewOnly: true },
      });
      setPreview(res.preview.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  const isMeaningCentered = (MEANING_CENTERED_TYPES as readonly string[]).includes(entity);

  async function buildAndExport() {
    setBusy(true);
    setError(null);
    try {
      if (isMeaningCentered) {
        // Purposeful, meaning-centered exports read directly from the
        // Concept/UtteranceGroup/ResponsePattern graph — no split-building
        // step needed, see src/domains/datasets/meaning-exports.ts.
        const p = new URLSearchParams();
        if (dialectId) p.set("dialectId", dialectId);
        if (qualityPreset === "everything") p.set("includeUnverified", "true");
        window.location.href = `/api/exports/${entity}?${p.toString()}`;
      } else {
        const res = await api<{ item: { id: string } }>("/api/datasets", {
          method: "POST",
          json: {
            name: name.trim() || `export-${new Date().toISOString().slice(0, 10)}`,
            filters,
            splitStrategy: { train: train / 100, validation: validation / 100, test: test / 100, seed: 42, groupBy },
          },
        });
        window.location.href = `/api/datasets/${res.item.id}/export?format=${format}`;
        void refetch();
      }
      setName("");
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Export" subtitle="Build a training-ready dataset from your verified data" />

      <div className="card p-5 mb-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Export type">
            <Select className="w-full" value={entity} onChange={(e) => setEntity(e.target.value as typeof entity)}>
              <option value="sentence-equivalents">Sentence equivalents (dialects → MSA)</option>
              <option value="concept-lexicon">Concept / dialect lexicon</option>
              <option value="conversation-training">Conversational responses (weighted)</option>
              <option value="chat-finetune">Chat fine-tuning pairs</option>
              <option value="sentence">Raw sentences (advanced)</option>
              <option value="conversation">Raw conversations (advanced)</option>
            </Select>
          </Field>
          <Field label="Dialect">
            <Select className="w-full" value={dialectId} onChange={(e) => setDialectId(e.target.value)}>
              <option value="">All dialects</option>
              {lookups && dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Quality">
            <Select className="w-full" value={qualityPreset} onChange={(e) => setQualityPreset(e.target.value as "verified" | "everything")}>
              <option value="verified">Verified/high-quality only</option>
              <option value="everything">Everything</option>
            </Select>
          </Field>
          <Field label="Format">
            {isMeaningCentered ? (
              <div className="text-sm py-1.5 text-muted">JSONL</div>
            ) : (
              <Select className="w-full" value={format} onChange={(e) => setFormat(e.target.value as "jsonl" | "csv")}>
                <option value="jsonl">JSONL</option>
                <option value="csv">CSV</option>
              </Select>
            )}
          </Field>
        </div>

        <div>
          <button onClick={() => setShowAdvanced((s) => !s)} className="text-xs text-muted hover:text-foreground underline">
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>
          {showAdvanced && (
            <div className="mt-3 border-t border-border pt-3 space-y-3">
              <Field label="Dataset name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="najdi-hospitality-v1" />
              </Field>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Verification">
                  <Select className="w-full" value={verification} onChange={(e) => setVerification(e.target.value)}>
                    <option value="">Any</option>
                    <option value="VERIFIED">Verified only</option>
                    <option value="UNVERIFIED">Unverified only</option>
                  </Select>
                </Field>
                <Field label="Training eligibility">
                  <Select className="w-full" value={training} onChange={(e) => setTraining(e.target.value)}>
                    <option value="">Any</option>
                    <option value="ELIGIBLE">Eligible only</option>
                    <option value="UNDECIDED">Undecided</option>
                  </Select>
                </Field>
                <Field label="Group by (leakage-safe splitting)">
                  <Select className="w-full" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "utteranceGroup" | "none")}>
                    <option value="utteranceGroup">Utterance group</option>
                    <option value="none">None (per-record)</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md">
                <Field label="Train %"><Input type="number" value={train} onChange={(e) => setTrain(Number(e.target.value))} /></Field>
                <Field label="Validation %"><Input type="number" value={validation} onChange={(e) => setValidation(Number(e.target.value))} /></Field>
                <Field label="Test %"><Input type="number" value={test} onChange={(e) => setTest(Number(e.target.value))} /></Field>
              </div>
              <p className="text-xs text-muted">
                Sentences from the same equivalent-utterance family always stay in the same split, preventing near-duplicate leakage across train/validation/test.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={runPreview} disabled={busy}>Preview count</Button>
          {preview !== null && <span className="text-sm text-muted">{preview.toLocaleString()} matching records</span>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={buildAndExport} disabled={busy}>{busy ? "Building…" : "Build & download"}</Button>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-muted mb-3">Previous exports</h2>
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No exports yet" />
      ) : (
        <div className="space-y-3">
          {data.items.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{d.name} <span className="text-xs text-muted">v{d.version}</span></h3>
                <Badge value={d.status} />
              </div>
              <div className="text-xs text-muted mb-3">
                {d._count.records.toLocaleString()} records · train {d.counts?.TRAIN ?? 0} · validation {d.counts?.VALIDATION ?? 0} · test {d.counts?.TEST ?? 0} · built by {d.createdBy?.name ?? "—"} on {new Date(d.createdAt).toLocaleDateString()}
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href={`/api/datasets/${d.id}/export?format=jsonl`}><Button variant="secondary">Download JSONL (all)</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=csv`}><Button variant="secondary">Download CSV (all)</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=TRAIN`}><Button variant="ghost">Train only</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=VALIDATION`}><Button variant="ghost">Validation only</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=TEST`}><Button variant="ghost">Test only</Button></a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
