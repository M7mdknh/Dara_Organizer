"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, EmptyState, Input, Button, Select, Field, Modal } from "@/components/ui";

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

export default function DatasetsPage() {
  const { data, loading, refetch } = useApi<{ items: DatasetRow[] }>("/api/datasets");
  const [showBuild, setShowBuild] = useState(false);

  return (
    <div>
      <PageHeader title="Datasets & Export" subtitle="Build reproducible, leakage-safe training datasets and export JSONL/CSV" actions={<Button onClick={() => setShowBuild(true)}>+ Build dataset</Button>} />
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No datasets built yet" />
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
                <a href={`/api/datasets/${d.id}/export?format=jsonl`}><Button variant="secondary">Export JSONL (all)</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=csv`}><Button variant="secondary">Export CSV (all)</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=TRAIN`}><Button variant="ghost">Train only</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=VALIDATION`}><Button variant="ghost">Validation only</Button></a>
                <a href={`/api/datasets/${d.id}/export?format=jsonl&split=TEST`}><Button variant="ghost">Test only</Button></a>
              </div>
            </div>
          ))}
        </div>
      )}
      {showBuild && <BuildDatasetModal onClose={() => setShowBuild(false)} onBuilt={() => { setShowBuild(false); void refetch(); }} />}
    </div>
  );
}

function BuildDatasetModal({ onClose, onBuilt }: { onClose: () => void; onBuilt: () => void }) {
  const lookups = useLookups();
  const [name, setName] = useState("");
  const [entity, setEntity] = useState<"sentence" | "conversation">("sentence");
  const [dialectId, setDialectId] = useState("");
  const [quality, setQuality] = useState<string[]>(["GOLD", "SILVER"]);
  const [verification, setVerification] = useState("");
  const [training, setTraining] = useState("ELIGIBLE");
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
    quality: quality.length ? quality : undefined,
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

  async function build() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/datasets", {
        method: "POST",
        json: {
          name,
          filters,
          splitStrategy: { train: train / 100, validation: validation / 100, test: test / 100, seed: 42, groupBy },
        },
      });
      onBuilt();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setBusy(false);
    }
  }

  const toggleQuality = (q: string) => setQuality((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));

  return (
    <Modal title="Build dataset" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Dataset name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="najdi-hospitality-v1" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Entity type">
            <Select className="w-full" value={entity} onChange={(e) => setEntity(e.target.value as "sentence" | "conversation")}>
              <option value="sentence">Sentences</option>
              <option value="conversation">Conversations</option>
            </Select>
          </Field>
          <Field label="Dialect">
            <Select className="w-full" value={dialectId} onChange={(e) => setDialectId(e.target.value)}>
              <option value="">All dialects</option>
              {lookups && dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
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
        </div>

        <Field label="Quality tiers">
          <div className="flex gap-3">
            {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => (
              <label key={q} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={quality.includes(q)} onChange={() => toggleQuality(q)} /> {q}
              </label>
            ))}
          </div>
        </Field>

        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium mb-2">Split strategy (leakage-safe)</h4>
          <p className="text-xs text-muted mb-3">
            Sentences from the same equivalent-utterance family always stay in the same split, preventing near-duplicate leakage across train/validation/test.
          </p>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Train %"><Input type="number" value={train} onChange={(e) => setTrain(Number(e.target.value))} /></Field>
            <Field label="Validation %"><Input type="number" value={validation} onChange={(e) => setValidation(Number(e.target.value))} /></Field>
            <Field label="Test %"><Input type="number" value={test} onChange={(e) => setTest(Number(e.target.value))} /></Field>
            <Field label="Group by">
              <Select className="w-full" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "utteranceGroup" | "none")}>
                <option value="utteranceGroup">Utterance group</option>
                <option value="none">None (per-record)</option>
              </Select>
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={runPreview} disabled={busy}>Preview count</Button>
          {preview !== null && <span className="text-sm text-muted">{preview.toLocaleString()} matching records</span>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={build} disabled={busy || !name.trim()}>{busy ? "Building…" : "Build dataset"}</Button>
        </div>
      </div>
    </Modal>
  );
}
