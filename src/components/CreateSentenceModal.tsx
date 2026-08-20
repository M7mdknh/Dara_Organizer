"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { Input, Button, Select, Field, Modal } from "@/components/ui";

export function CreateSentenceModal({
  onClose,
  onCreated,
  defaultUtteranceGroupId,
}: {
  onClose: () => void;
  onCreated: () => void;
  defaultUtteranceGroupId?: string;
}) {
  const lookups = useLookups();
  const [form, setForm] = useState<Record<string, string>>({ utteranceGroupId: defaultUtteranceGroupId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!lookups) return null;
  return (
    <Modal title="New sentence" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            const result = await api<{ matched: boolean }>("/api/sentences", {
              method: "POST",
              json: {
                textOriginal: form.textOriginal,
                languageId: form.languageId,
                dialectId: form.dialectId || null,
                meaning: form.meaning || null,
                utteranceGroupId: form.utteranceGroupId || null,
                intentId: form.intentId || null,
                situationId: form.situationId || null,
                registerId: form.registerId || null,
              },
            });
            if (result.matched) {
              setInfo("An identical sentence already exists — matched instead of duplicated.");
              setSaving(false);
              setTimeout(onCreated, 1200);
            } else {
              onCreated();
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
            setSaving(false);
          }
        }}
      >
        <Field label="Sentence text">
          <Input dir="auto" className="text-lg" value={form.textOriginal ?? ""} onChange={(e) => set("textOriginal", e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language">
            <Select className="w-full" value={form.languageId ?? ""} onChange={(e) => set("languageId", e.target.value)} required>
              <option value="">Select…</option>
              {lookups.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Dialect">
            <Select className="w-full" value={form.dialectId ?? ""} onChange={(e) => set("dialectId", e.target.value)}>
              <option value="">None</option>
              {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Intent">
            <Select className="w-full" value={form.intentId ?? ""} onChange={(e) => set("intentId", e.target.value)}>
              <option value="">None</option>
              {lookups.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label="Situation">
            <Select className="w-full" value={form.situationId ?? ""} onChange={(e) => set("situationId", e.target.value)}>
              <option value="">None</option>
              {lookups.situations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Meaning (English gloss)">
          <Input value={form.meaning ?? ""} onChange={(e) => set("meaning", e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-amber-600">{info}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create sentence"}</Button>
        </div>
      </form>
    </Modal>
  );
}
