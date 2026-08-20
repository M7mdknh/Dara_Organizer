"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Textarea, Button, Select, Field, confirmDanger } from "@/components/ui";
import { RevisionHistory } from "@/components/RevisionHistory";

interface SentenceDetail {
  id: string;
  textOriginal: string;
  meaning: string | null;
  literalNote: string | null;
  quality: string;
  verification: string;
  training: string;
  naturalness: string;
  commonness: string;
  origin: string;
  dialectConfidence: string | null;
  dialect: { id: string; name: string } | null;
  language: { id: string; name: string };
  intent: { id: string; name: string } | null;
  situation: { id: string; name: string } | null;
  register: { id: string; name: string } | null;
  source: { id: string; name: string } | null;
  utteranceGroup: {
    id: string;
    name: string;
    sentences: { id: string; textOriginal: string; dialect: { name: string } | null; language: { name: string } }[];
  } | null;
  pronunciations: { id: string; arabicPhonetic: string | null; ipa: string | null; dialect: { name: string } | null }[];
}

const TABS = ["Overview", "Equivalent utterances", "Pronunciation", "History"] as const;

export default function SentenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: SentenceDetail }>(`/api/sentences/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const lookups = useLookups();

  if (loading || !lookups) return <Spinner />;
  if (!data?.item) return <EmptyState title="Sentence not found" />;
  const s = data.item;

  return (
    <div>
      <PageHeader
        title={s.textOriginal}
        subtitle={s.meaning ?? undefined}
        actions={
          <>
            <Badge value={s.quality} />
            <Badge value={s.verification} />
            <Badge value={s.origin} />
          </>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <SentenceOverview sentence={s} onSaved={refetch} />}
      {tab === "Equivalent utterances" && (
        <div className="card p-4">
          <p className="text-xs text-muted mb-3">
            Equivalent utterances express the same communicative meaning across dialects/languages — they are natural realizations, not literal translations.
          </p>
          {!s.utteranceGroup ? (
            <EmptyState title="Not part of an utterance group" hint="Link this sentence to a group from Sentences → New, or edit the group field" />
          ) : s.utteranceGroup.sentences.length === 0 ? (
            <EmptyState title="No other sentences in this group yet" />
          ) : (
            <div className="space-y-1.5">
              {s.utteranceGroup.sentences.map((eq) => (
                <Link key={eq.id} href={`/sentences/${eq.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                  <ArabicText text={eq.textOriginal} className="text-base" />
                  <span className="text-xs text-muted">{eq.dialect?.name ?? eq.language.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "Pronunciation" && (
        <div className="card p-4">
          {s.pronunciations.length === 0 ? (
            <EmptyState title="No pronunciation recorded" />
          ) : (
            <div className="space-y-2">
              {s.pronunciations.map((p) => (
                <div key={p.id} className="border border-border rounded-lg p-3 text-sm">
                  {p.arabicPhonetic && <ArabicText text={p.arabicPhonetic} className="block text-base" />}
                  {p.ipa && <span className="text-muted font-mono text-xs">/{p.ipa}/</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "History" && (
        <div className="card p-4">
          <RevisionHistory entityType="sentence" entityId={id} restorable onRestored={refetch} />
        </div>
      )}
    </div>
  );
}

function SentenceOverview({ sentence: s, onSaved }: { sentence: SentenceDetail; onSaved: () => void }) {
  const lookups = useLookups();
  const [form, setForm] = useState({
    textOriginal: s.textOriginal,
    meaning: s.meaning ?? "",
    literalNote: s.literalNote ?? "",
    dialectId: s.dialect?.id ?? "",
    intentId: s.intent?.id ?? "",
    situationId: s.situation?.id ?? "",
    registerId: s.register?.id ?? "",
    quality: s.quality,
    naturalness: s.naturalness,
    commonness: s.commonness,
    training: s.training,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/sentences/${s.id}`, {
        method: "PATCH",
        json: {
          textOriginal: form.textOriginal,
          meaning: form.meaning || null,
          literalNote: form.literalNote || null,
          dialectId: form.dialectId || null,
          intentId: form.intentId || null,
          situationId: form.situationId || null,
          registerId: form.registerId || null,
          quality: form.quality,
          naturalness: form.naturalness,
          commonness: form.commonness,
          training: form.training,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!lookups) return <Spinner />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 card p-4 space-y-3">
        <Field label="Sentence text">
          <Input dir="auto" className="text-lg" value={form.textOriginal} onChange={(e) => setForm((f) => ({ ...f, textOriginal: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dialect">
            <Select className="w-full" value={form.dialectId} onChange={(e) => setForm((f) => ({ ...f, dialectId: e.target.value }))}>
              <option value="">None</option>
              {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Register">
            <Select className="w-full" value={form.registerId} onChange={(e) => setForm((f) => ({ ...f, registerId: e.target.value }))}>
              <option value="">None</option>
              {lookups.registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Intent">
            <Select className="w-full" value={form.intentId} onChange={(e) => setForm((f) => ({ ...f, intentId: e.target.value }))}>
              <option value="">None</option>
              {lookups.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label="Situation">
            <Select className="w-full" value={form.situationId} onChange={(e) => setForm((f) => ({ ...f, situationId: e.target.value }))}>
              <option value="">None</option>
              {lookups.situations.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Meaning (English gloss)">
          <Input value={form.meaning} onChange={(e) => setForm((f) => ({ ...f, meaning: e.target.value }))} />
        </Field>
        <Field label="Literal translation note (optional — equivalence matters more)">
          <Textarea rows={2} value={form.literalNote} onChange={(e) => setForm((f) => ({ ...f, literalNote: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Naturalness">
            <Select className="w-full" value={form.naturalness} onChange={(e) => setForm((f) => ({ ...f, naturalness: e.target.value }))}>
              {["NATURAL", "ACCEPTABLE", "UNNATURAL", "UNKNOWN"].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Commonness">
            <Select className="w-full" value={form.commonness} onChange={(e) => setForm((f) => ({ ...f, commonness: e.target.value }))}>
              {["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"].map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Quality tier">
            <Select className="w-full" value={form.quality} onChange={(e) => setForm((f) => ({ ...f, quality: e.target.value }))}>
              {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => <option key={q} value={q}>{q}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-between pt-2">
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirmDanger("Delete this sentence?")) return;
              await api(`/api/sentences/${s.id}`, { method: "DELETE" });
              window.location.href = "/sentences";
            }}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            {s.verification !== "VERIFIED" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await api(`/api/sentences/${s.id}`, { method: "PATCH", json: { verification: "VERIFIED" } });
                  onSaved();
                }}
              >
                Mark verified
              </Button>
            )}
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-muted mb-2">Provenance</h3>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between"><dt className="text-muted">Origin</dt><dd><Badge value={s.origin} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{s.source?.name ?? "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Language</dt><dd>{s.language.name}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Utterance group</dt><dd>{s.utteranceGroup?.name ?? "—"}</dd></div>
        </dl>
      </div>
    </div>
  );
}
