"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions, categoryOptions } from "@/components/lookups";
import { Button, Select, confirmDanger } from "@/components/ui";

/** Bulk action bar shown when table rows are selected. */
export function BulkBar({
  entityType,
  ids,
  onDone,
}: {
  entityType: "sentence" | "expression" | "conversation";
  ids: string[];
  onDone: () => void;
}) {
  const lookups = useLookups();
  const collections = useApi<{ items: { id: string; name: string }[] }>("/api/collections");
  const [action, setAction] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsValue: Record<string, "dialect" | "category" | "collection" | "quality" | "training" | null> = {
    setDialect: "dialect",
    addCategory: "category",
    removeCategory: "category",
    addToCollection: "collection",
    removeFromCollection: "collection",
    setQuality: "quality",
    setTraining: "training",
    verify: null,
    unverify: null,
    enrich: null,
    delete: null,
  };

  async function run() {
    if (!action) return;
    if (action === "delete" && !confirmDanger(`Permanently delete ${ids.length} records? Revision snapshots are kept, but the records will be removed.`)) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "enrich") {
        await api("/api/enrich", { method: "POST", json: { type: "translate", entityType, entityIds: ids.slice(0, 50) } });
      } else {
        await api("/api/bulk", { method: "POST", json: { entityType, ids, action, value: value || null } });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  const valueKind = needsValue[action];

  return (
    <div className="card px-3 py-2 mb-3 flex flex-wrap items-center gap-2 border-accent/40 bg-accent/5">
      <span className="text-sm font-medium">{ids.length} selected</span>
      <Select value={action} onChange={(e) => { setAction(e.target.value); setValue(""); }}>
        <option value="">Choose action…</option>
        <option value="verify">Mark verified</option>
        <option value="unverify">Mark unverified</option>
        <option value="setQuality">Set quality tier</option>
        <option value="setTraining">Set training eligibility</option>
        <option value="setDialect">Change dialect</option>
        <option value="addCategory">Add category</option>
        <option value="removeCategory">Remove category</option>
        <option value="addToCollection">Add to collection</option>
        <option value="removeFromCollection">Remove from collection</option>
        {entityType !== "conversation" && <option value="enrich">Send for AI enrichment</option>}
        <option value="delete">Delete…</option>
      </Select>
      {valueKind === "dialect" && lookups && (
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select dialect…</option>
          {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </Select>
      )}
      {valueKind === "category" && lookups && (
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select category…</option>
          {categoryOptions(lookups.categories).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      )}
      {valueKind === "collection" && (
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select collection…</option>
          {collections.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      )}
      {valueKind === "quality" && (
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select tier…</option>
          {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => <option key={q} value={q}>{q}</option>)}
        </Select>
      )}
      {valueKind === "training" && (
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Select…</option>
          {["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"].map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
        </Select>
      )}
      <Button onClick={run} disabled={busy || !action || (valueKind !== null && valueKind !== undefined && !value)} variant={action === "delete" ? "danger" : "primary"}>
        {busy ? "Working…" : "Apply"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
