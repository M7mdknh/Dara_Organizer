"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Button, Select, Input } from "@/components/ui";

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

/** Save/apply named filter configurations for a list view. */
export function SavedViewsBar({
  viewKey,
  filters,
  onApply,
}: {
  viewKey: string;
  filters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const { data, refetch } = useApi<{ items: SavedView[] }>(`/api/saved-views?viewKey=${viewKey}`);
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="flex items-center gap-2 ms-auto">
      {data && data.items.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            const view = data.items.find((v) => v.id === e.target.value);
            if (view) onApply(view.filters);
          }}
        >
          <option value="">Saved views…</option>
          {data.items.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </Select>
      )}
      {naming ? (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setSaving(true);
            try {
              await api("/api/saved-views", { method: "POST", json: { name: name.trim(), viewKey, filters } });
              setNaming(false);
              setName("");
              void refetch();
            } finally {
              setSaving(false);
            }
          }}
        >
          <Input autoFocus className="w-40" placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={saving}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(false)}>×</Button>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setNaming(true)}>Save view</Button>
      )}
    </div>
  );
}
