"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { invalidateLookups, type DialectNode } from "@/components/lookups";
import { Button, Input, Field, EmptyState, Select, confirmDanger } from "@/components/ui";

function tree(dialects: DialectNode[], parentId: string | null): DialectNode[] {
  return dialects.filter((d) => (d.parentId ?? null) === parentId);
}

export function DialectManager({ dialects, onChanged }: { dialects: DialectNode[]; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [newNameAr, setNewNameAr] = useState("");
  const [newParent, setNewParent] = useState("");
  const [mergeSource, setMergeSource] = useState<DialectNode | null>(null);

  async function refresh() {
    invalidateLookups();
    onChanged();
  }

  async function create() {
    if (!newName.trim()) return;
    await api("/api/dialects", { method: "POST", json: { name: newName.trim(), nameAr: newNameAr.trim() || null, parentId: newParent || null } });
    setNewName("");
    setNewNameAr("");
    await refresh();
  }

  async function rename(d: DialectNode, name: string) {
    if (!name.trim() || name === d.name) return;
    await api(`/api/dialects/${d.id}`, { method: "PATCH", json: { name: name.trim() } });
    await refresh();
  }

  async function toggle(d: DialectNode) {
    await api(`/api/dialects/${d.id}`, { method: "PATCH", json: { enabled: !d.enabled } });
    await refresh();
  }

  async function reparent(d: DialectNode, parentId: string) {
    try {
      await api(`/api/dialects/${d.id}`, { method: "PATCH", json: { parentId: parentId || null } });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to move");
    }
  }

  async function remove(d: DialectNode) {
    if (!confirmDanger(`Delete "${d.name}"? Only possible if no data or subdialects reference it.`)) return;
    try {
      await api(`/api/dialects/${d.id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete. Try merging instead.");
    }
  }

  function Row({ d, depth }: { d: DialectNode; depth: number }) {
    const children = tree(dialects, d.id);
    return (
      <>
        <div className="flex items-center gap-2 py-1.5 border-b border-border/50" style={{ paddingInlineStart: depth * 20 }}>
          <input
            className="flex-1 bg-transparent border-none text-sm outline-none focus:bg-foreground/5 rounded px-1"
            defaultValue={d.name}
            onBlur={(e) => rename(d, e.target.value)}
          />
          {d.nameAr && <span className="text-xs text-muted" dir="rtl">{d.nameAr}</span>}
          <Select value={d.parentId ?? ""} onChange={(e) => reparent(d, e.target.value)} className="text-xs">
            <option value="">Top level</option>
            {dialects.filter((x) => x.id !== d.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={d.enabled} onChange={() => toggle(d)} /> Enabled
          </label>
          <button className="text-xs text-muted hover:underline" onClick={() => setMergeSource(d)}>Merge into…</button>
          <button className="text-xs text-red-600 hover:underline" onClick={() => remove(d)}>Delete</button>
        </div>
        {children.map((c) => <Row key={c.id} d={c} depth={depth + 1} />)}
      </>
    );
  }

  const roots = tree(dialects, null);

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">Dialect hierarchy</h3>
      {dialects.length === 0 ? (
        <EmptyState title="No dialects yet" />
      ) : (
        <div className="mb-4">{roots.map((d) => <Row key={d.id} d={d} depth={0} />)}</div>
      )}
      <div className="flex gap-2 items-end flex-wrap">
        <Field label="New dialect name">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jeddawi" />
        </Field>
        <Field label="Arabic name (optional)">
          <Input dir="rtl" value={newNameAr} onChange={(e) => setNewNameAr(e.target.value)} />
        </Field>
        <Field label="Parent (optional)">
          <Select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">Top level</option>
            {dialects.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Button onClick={create} disabled={!newName.trim()}>Add dialect</Button>
      </div>

      {mergeSource && (
        <div className="mt-4 border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
          <p className="text-sm mb-2">
            Merge <strong>{mergeSource.name}</strong> into another dialect. All linked expressions, sentences,
            pronunciations, and conversations will be relinked; subdialects move up; {mergeSource.name} is removed.
          </p>
          <div className="flex gap-2">
            <Select
              onChange={async (e) => {
                if (!e.target.value) return;
                if (!confirmDanger(`Merge "${mergeSource.name}" into the selected dialect? This cannot be undone.`)) return;
                await api(`/api/dialects/${mergeSource.id}`, { method: "POST", json: { action: "merge", intoId: e.target.value } });
                setMergeSource(null);
                await refresh();
              }}
              defaultValue=""
            >
              <option value="" disabled>Select target dialect…</option>
              {dialects.filter((d) => d.id !== mergeSource.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => setMergeSource(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
