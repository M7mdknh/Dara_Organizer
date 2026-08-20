"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Button, Input, Field, EmptyState, Spinner, confirmDanger } from "@/components/ui";

interface TaxonomyItem {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  enabled: boolean;
}

/** Generic manager for flat, admin-editable taxonomies (topics, intents, situations, registers, functions). */
export function TaxonomyManager({ type, label, arabicNames }: { type: string; label: string; arabicNames?: boolean }) {
  const { data, loading, refetch } = useApi<{ items: TaxonomyItem[] }>(`/api/taxonomies/${type}`);
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api(`/api/taxonomies/${type}`, { method: "POST", json: { name: name.trim(), nameAr: nameAr.trim() || null } });
      setName("");
      setNameAr("");
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: TaxonomyItem) {
    await api(`/api/taxonomies/${type}/${item.id}`, { method: "PATCH", json: { enabled: !item.enabled } });
    refetch();
  }

  async function rename(item: TaxonomyItem, newName: string) {
    if (!newName.trim() || newName === item.name) return;
    await api(`/api/taxonomies/${type}/${item.id}`, { method: "PATCH", json: { name: newName.trim() } });
    refetch();
  }

  async function remove(item: TaxonomyItem) {
    if (!confirmDanger(`Delete "${item.name}"? Only possible if nothing references it.`)) return;
    try {
      await api(`/api/taxonomies/${type}/${item.id}`, { method: "DELETE" });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">{label}</h3>
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title={`No ${label.toLowerCase()} yet`} />
      ) : (
        <div className="space-y-1 mb-4">
          {data.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 border-b border-border/50">
              <input
                className="flex-1 bg-transparent border-none text-sm outline-none focus:bg-foreground/5 rounded px-1"
                defaultValue={item.name}
                onBlur={(e) => rename(item, e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={item.enabled} onChange={() => toggle(item)} />
                Enabled
              </label>
              <button className="text-xs text-red-600 hover:underline" onClick={() => remove(item)}>Delete</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Field label="New item">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Add a new ${label.toLowerCase().replace(/s$/, "")}…`} />
        </Field>
        {arabicNames && (
          <Field label="Arabic name">
            <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </Field>
        )}
        <div className="self-end">
          <Button onClick={create} disabled={saving || !name.trim()}>Add</Button>
        </div>
      </div>
    </div>
  );
}
