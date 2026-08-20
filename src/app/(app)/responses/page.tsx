"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi, api, useDebounced } from "@/lib/client";
import { useLookups } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button, Select, Field, Modal } from "@/components/ui";

interface PatternRow {
  id: string;
  name: string;
  intent: { name: string } | null;
  triggers: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  variants: { id: string; textOriginal: string; weight: number; dialect: { name: string } | null }[];
}

export default function ResponsesPage() {
  const lookups = useLookups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [intentId, setIntentId] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ pageSize: "50" });
    if (dq) p.set("q", dq);
    if (intentId) p.set("intentId", intentId);
    return p.toString();
  }, [dq, intentId]);

  const { data, loading, refetch } = useApi<{ items: PatternRow[] }>(`/api/response-patterns?${query}`);

  return (
    <div>
      <PageHeader
        title="Conversational Responses"
        subtitle="Triggers → response families → weighted natural response variants"
        actions={<Button onClick={() => setShowCreate(true)}>+ New response pattern</Button>}
      />
      <div className="flex gap-2 mb-4">
        <Input className="max-w-xs" dir="auto" placeholder="Search triggers or responses…" value={q} onChange={(e) => setQ(e.target.value)} />
        {lookups && (
          <Select value={intentId} onChange={(e) => setIntentId(e.target.value)}>
            <option value="">Any intent</option>
            {lookups.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No response patterns yet" hint='Try كفو → كفوك الطيب / كفوك العز' />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.items.map((p) => (
            <Link key={p.id} href={`/responses/${p.id}`} className="card p-4 hover:border-accent transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{p.name}</h3>
                {p.intent && <Badge value="INTENT" label={p.intent.name} />}
              </div>
              <div className="text-xs text-muted mb-1">Triggers</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {p.triggers.length === 0 && <span className="text-xs text-muted">None</span>}
                {p.triggers.map((t) => (
                  <span key={t.id} className="text-sm bg-foreground/5 rounded-full px-2 py-0.5">
                    <ArabicText text={t.textOriginal} />
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted mb-1">Responses (by weight)</div>
              <div className="flex flex-wrap gap-1.5">
                {p.variants.slice(0, 5).map((v) => (
                  <span key={v.id} className="text-sm bg-accent/10 text-accent rounded-full px-2 py-0.5">
                    <ArabicText text={v.textOriginal} /> <span className="text-[10px]">{v.weight}</span>
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreatePatternModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refetch(); }} />}
    </div>
  );
}

function CreatePatternModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const lookups = useLookups();
  const [name, setName] = useState("");
  const [intentId, setIntentId] = useState("");
  const [trigger, setTrigger] = useState("");
  const [variant, setVariant] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="New response pattern" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api("/api/response-patterns", {
              method: "POST",
              json: {
                name,
                intentId: intentId || null,
                triggers: trigger ? [{ textOriginal: trigger }] : [],
                variants: variant ? [{ textOriginal: variant, weight: 10 }] : [],
              },
            });
            onCreated();
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Pattern name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Response to كفو" />
        </Field>
        <Field label="Intent (optional)">
          <Select className="w-full" value={intentId} onChange={(e) => setIntentId(e.target.value)}>
            <option value="">None</option>
            {lookups?.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="First trigger (optional — add more later)">
          <Input dir="auto" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="كفو" />
        </Field>
        <Field label="First response variant (optional — add more later)">
          <Input dir="auto" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="كفوك الطيب" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name}>{saving ? "Creating…" : "Create pattern"}</Button>
        </div>
      </form>
    </Modal>
  );
}
