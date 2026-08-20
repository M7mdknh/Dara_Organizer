"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { Input, Button, Select, Field, Modal } from "@/components/ui";

export function CreateExpressionModal({
  onClose,
  onCreated,
  defaultConceptId,
}: {
  onClose: () => void;
  onCreated: () => void;
  defaultConceptId?: string;
}) {
  const lookups = useLookups();
  const [form, setForm] = useState<Record<string, string>>({ conceptId: defaultConceptId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const concepts = useApi<{ items: { id: string; key: string; gloss: string }[] }>("/api/concepts?pageSize=200");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!lookups) return null;
  return (
    <Modal title="New expression" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const result = await api<{ matched: boolean; review: unknown }>("/api/expressions", {
              method: "POST",
              json: {
                textOriginal: form.textOriginal,
                languageId: form.languageId,
                dialectId: form.dialectId || null,
                type: form.type || undefined,
                registerId: form.registerId || null,
                commonness: form.commonness || undefined,
                meaningNote: form.meaningNote || null,
                conceptId: form.conceptId || null,
              },
            });
            if (result.matched) {
              setInfo("An identical expression already exists in this dialect — it was matched instead of duplicated.");
              setSaving(false);
              setTimeout(onCreated, 1200);
            } else if (result.review) {
              setInfo("Created. A semantic overlap with existing expressions was detected and sent to the Review Inbox.");
              setSaving(false);
              setTimeout(onCreated, 1600);
            } else {
              onCreated();
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
            setSaving(false);
          }
        }}
      >
        <Field label="Text">
          <Input dir="auto" value={form.textOriginal ?? ""} onChange={(e) => set("textOriginal", e.target.value)} required className="text-lg" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language">
            <Select value={form.languageId ?? ""} onChange={(e) => set("languageId", e.target.value)} required className="w-full">
              <option value="">Select…</option>
              {lookups.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Dialect">
            <Select value={form.dialectId ?? ""} onChange={(e) => set("dialectId", e.target.value)} className="w-full">
              <option value="">None / not dialect-specific</option>
              {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.type ?? ""} onChange={(e) => set("type", e.target.value)} className="w-full">
              <option value="">Expression</option>
              {["WORD", "PHRASE", "IDIOM", "SLANG", "GREETING", "FORMULA", "FILLER", "DISCOURSE_MARKER"].map((t) => (
                <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Commonness (human estimate)">
            <Select value={form.commonness ?? ""} onChange={(e) => set("commonness", e.target.value)} className="w-full">
              <option value="">Unknown</option>
              {["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL"].map((c) => (
                <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Register">
            <Select value={form.registerId ?? ""} onChange={(e) => set("registerId", e.target.value)} className="w-full">
              <option value="">None</option>
              {lookups.registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Concept">
            <Select value={form.conceptId ?? ""} onChange={(e) => set("conceptId", e.target.value)} className="w-full">
              <option value="">None</option>
              {concepts.data?.items.map((c) => <option key={c.id} value={c.id}>{c.key} — {c.gloss}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Meaning note">
          <Input value={form.meaningNote ?? ""} onChange={(e) => set("meaningNote", e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-amber-600">{info}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create expression"}</Button>
        </div>
      </form>
    </Modal>
  );
}
