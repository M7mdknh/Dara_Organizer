"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { Button, Input, Select, Field, Spinner, confirmDanger } from "@/components/ui";

export interface TurnForm {
  id?: string;
  speaker: string;
  textOriginal: string;
  dialectId: string;
  intentId: string;
  functionId: string;
  notes: string;
}

export interface ConversationFormState {
  title: string;
  description: string;
  dialectId: string;
  situationId: string;
  quality: string;
  categoryIds: string[];
  turns: TurnForm[];
}

export function emptyConversation(): ConversationFormState {
  return {
    title: "",
    description: "",
    dialectId: "",
    situationId: "",
    quality: "CANDIDATE",
    categoryIds: [],
    turns: [
      { speaker: "A", textOriginal: "", dialectId: "", intentId: "", functionId: "", notes: "" },
      { speaker: "B", textOriginal: "", dialectId: "", intentId: "", functionId: "", notes: "" },
    ],
  };
}

export function ConversationEditor({
  initial,
  conversationId,
  onSaved,
}: {
  initial: ConversationFormState;
  conversationId?: string;
  onSaved: (id: string) => void;
}) {
  const lookups = useLookups();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lookups) return <Spinner />;

  function updateTurn(i: number, patch: Partial<TurnForm>) {
    setForm((f) => ({ ...f, turns: f.turns.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  }
  function addTurn() {
    const lastSpeaker = form.turns[form.turns.length - 1]?.speaker ?? "A";
    const nextSpeaker = lastSpeaker === "A" ? "B" : "A";
    setForm((f) => ({ ...f, turns: [...f.turns, { speaker: nextSpeaker, textOriginal: "", dialectId: "", intentId: "", functionId: "", notes: "" }] }));
  }
  function removeTurn(i: number) {
    setForm((f) => ({ ...f, turns: f.turns.filter((_, idx) => idx !== i) }));
  }
  function moveTurn(i: number, dir: -1 | 1) {
    setForm((f) => {
      const turns = [...f.turns];
      const j = i + dir;
      if (j < 0 || j >= turns.length) return f;
      [turns[i], turns[j]] = [turns[j], turns[i]];
      return { ...f, turns };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        dialectId: form.dialectId || null,
        situationId: form.situationId || null,
        quality: form.quality,
        categoryIds: form.categoryIds,
        turns: form.turns
          .filter((t) => t.textOriginal.trim())
          .map((t) => ({
            speaker: t.speaker,
            textOriginal: t.textOriginal,
            dialectId: t.dialectId || null,
            intentId: t.intentId || null,
            functionId: t.functionId || null,
            notes: t.notes || null,
          })),
      };
      if (payload.turns.length === 0) throw new Error("Add at least one turn");
      if (conversationId) {
        await api(`/api/conversations/${conversationId}`, { method: "PATCH", json: payload });
        onSaved(conversationId);
      } else {
        const result = await api<{ item: { id: string } }>("/api/conversations", { method: "POST", json: payload });
        onSaved(result.item.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 grid md:grid-cols-2 gap-3">
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </Field>
        <Field label="Quality tier">
          <Select className="w-full" value={form.quality} onChange={(e) => setForm((f) => ({ ...f, quality: e.target.value }))}>
            {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
        </Field>
        <Field label="Dialect">
          <Select className="w-full" value={form.dialectId} onChange={(e) => setForm((f) => ({ ...f, dialectId: e.target.value }))}>
            <option value="">None</option>
            {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Situation">
          <Select className="w-full" value={form.situationId} onChange={(e) => setForm((f) => ({ ...f, situationId: e.target.value }))}>
            <option value="">None</option>
            {lookups.situations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-muted mb-3">Turns</h3>
        <div className="space-y-3">
          {form.turns.map((t, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Input className="w-16" value={t.speaker} onChange={(e) => updateTurn(i, { speaker: e.target.value })} />
                <Input dir="auto" className="flex-1 text-base" placeholder="Utterance…" value={t.textOriginal} onChange={(e) => updateTurn(i, { textOriginal: e.target.value })} />
                <button type="button" className="text-muted hover:text-foreground" onClick={() => moveTurn(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="text-muted hover:text-foreground" onClick={() => moveTurn(i, 1)} disabled={i === form.turns.length - 1}>↓</button>
                <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => removeTurn(i)}>Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select value={t.dialectId} onChange={(e) => updateTurn(i, { dialectId: e.target.value })}>
                  <option value="">Conversation dialect</option>
                  {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </Select>
                <Select value={t.intentId} onChange={(e) => updateTurn(i, { intentId: e.target.value })}>
                  <option value="">Intent…</option>
                  {lookups.intents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Select value={t.functionId} onChange={(e) => updateTurn(i, { functionId: e.target.value })}>
                  <option value="">Function…</option>
                  {lookups.functions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" onClick={addTurn} type="button">+ Add turn</Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between">
        {conversationId && (
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirmDanger("Delete this conversation?")) return;
              await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
              window.location.href = "/conversations";
            }}
          >
            Delete
          </Button>
        )}
        <Button className="ms-auto" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save conversation"}</Button>
      </div>
    </div>
  );
}
