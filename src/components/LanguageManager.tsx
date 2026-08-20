"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { invalidateLookups, type Language } from "@/components/lookups";
import { Button, Input, Field, EmptyState, Select } from "@/components/ui";

export function LanguageManager({ languages, onChanged }: { languages: Language[]; onChanged: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");

  async function refresh() {
    invalidateLookups();
    onChanged();
  }

  async function create() {
    if (!code.trim() || !name.trim()) return;
    await api("/api/languages", { method: "POST", json: { code: code.trim(), name: name.trim(), direction } });
    setCode("");
    setName("");
    await refresh();
  }

  async function toggle(l: Language) {
    await api(`/api/languages/${l.id}`, { method: "PATCH", json: { enabled: !l.enabled } });
    await refresh();
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">Languages</h3>
      {languages.length === 0 ? (
        <EmptyState title="No languages configured" />
      ) : (
        <div className="mb-4">
          {languages.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-1.5 border-b border-border/50">
              <span className="w-16 font-mono text-xs">{l.code}</span>
              <span className="flex-1 text-sm">{l.name}</span>
              <span className="text-xs text-muted">{l.direction.toUpperCase()}</span>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={l.enabled} onChange={() => toggle(l)} /> Enabled
              </label>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <Field label="Code">
          <Input className="w-24" value={code} onChange={(e) => setCode(e.target.value)} placeholder="fr" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="French" />
        </Field>
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "ltr" | "rtl")}>
            <option value="ltr">LTR</option>
            <option value="rtl">RTL</option>
          </Select>
        </Field>
        <Button onClick={create} disabled={!code.trim() || !name.trim()}>Add language</Button>
      </div>
    </div>
  );
}
