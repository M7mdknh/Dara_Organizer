"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { invalidateLookups } from "@/components/lookups";
import { Button, Input, Field, EmptyState, Select, confirmDanger } from "@/components/ui";

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  enabled: boolean;
  _count?: { sentences: number; expressions: number; conversations: number };
}

function tree(items: CategoryItem[], parentId: string | null): CategoryItem[] {
  return items.filter((c) => (c.parentId ?? null) === parentId);
}

export function CategoryManager({ categories, onChanged }: { categories: CategoryItem[]; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");

  async function refresh() {
    invalidateLookups();
    onChanged();
  }

  async function create() {
    if (!newName.trim()) return;
    await api("/api/categories", { method: "POST", json: { name: newName.trim(), parentId: newParent || null } });
    setNewName("");
    await refresh();
  }

  async function rename(c: CategoryItem, name: string) {
    if (!name.trim() || name === c.name) return;
    await api(`/api/categories/${c.id}`, { method: "PATCH", json: { name: name.trim() } });
    await refresh();
  }

  async function toggle(c: CategoryItem) {
    await api(`/api/categories/${c.id}`, { method: "PATCH", json: { enabled: !c.enabled } });
    await refresh();
  }

  async function remove(c: CategoryItem) {
    if (!confirmDanger(`Delete "${c.name}"?`)) return;
    try {
      await api(`/api/categories/${c.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function Row({ c, depth }: { c: CategoryItem; depth: number }) {
    const children = tree(categories, c.id);
    const usage = (c._count?.sentences ?? 0) + (c._count?.expressions ?? 0) + (c._count?.conversations ?? 0);
    return (
      <>
        <div className="flex items-center gap-2 py-1.5 border-b border-border/50" style={{ paddingInlineStart: depth * 20 }}>
          <input className="flex-1 bg-transparent border-none text-sm outline-none focus:bg-foreground/5 rounded px-1" defaultValue={c.name} onBlur={(e) => rename(c, e.target.value)} />
          <span className="text-xs text-muted">{usage} linked</span>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={c.enabled} onChange={() => toggle(c)} /> Enabled
          </label>
          <button className="text-xs text-red-600 hover:underline" onClick={() => remove(c)}>Delete</button>
        </div>
        {children.map((cc) => <Row key={cc.id} c={cc} depth={depth + 1} />)}
      </>
    );
  }

  const roots = tree(categories, null);

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">Categories</h3>
      {categories.length === 0 ? <EmptyState title="No categories yet" /> : <div className="mb-4">{roots.map((c) => <Row key={c.id} c={c} depth={0} />)}</div>}
      <div className="flex gap-2 items-end">
        <Field label="New category name">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Hospitality" />
        </Field>
        <Field label="Parent (optional)">
          <Select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">Top level</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Button onClick={create} disabled={!newName.trim()}>Add category</Button>
      </div>
    </div>
  );
}
