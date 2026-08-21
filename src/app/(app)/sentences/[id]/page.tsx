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
  concepts: { concept: { id: string; key: string; gloss: string; canonicalMsa: string | null } }[];
  expressions: { expression: { id: string; textOriginal: string; dialect: { name: string } | null } }[];
  utteranceGroup: {
    id: string;
    name: string;
    sentences: { id: string; textOriginal: string; dialect: { name: string } | null; language: { name: string } }[];
  } | null;
  pronunciations: { id: string; arabicPhonetic: string | null; ipa: string | null; dialect: { name: string } | null }[];
}

export default function SentenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: SentenceDetail }>(`/api/sentences/${id}`);
  const [editing, setEditing] = useState(false);
  const lookups = useLookups();

  if (loading || !lookups) return <Spinner />;
  if (!data?.item) return <EmptyState title="Sentence not found" />;
  const s = data.item;

  const msaEquiv =
    s.utteranceGroup?.sentences.find((eq) => eq.language.name.toLowerCase().includes("standard"))?.textOriginal ?? null;
  const otherEquivalents = s.utteranceGroup?.sentences.filter((eq) => eq.textOriginal !== msaEquiv) ?? [];

  return (
    <div>
      <PageHeader
        title={s.textOriginal}
        subtitle={[s.dialect?.name, "Processed by Dara"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge value={s.quality} />
            <Badge value={s.verification} />
            <Button variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</Button>
          </>
        }
      />

      {editing ? (
        <SentenceEditForm sentence={s} onSaved={() => { setEditing(false); refetch(); }} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {(msaEquiv || s.meaning) && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-muted mb-2">Meaning</h3>
                <div className="space-y-1.5 text-sm">
                  {msaEquiv && (
                    <div className="flex gap-2">
                      <span className="text-xs text-muted w-16 shrink-0 pt-0.5">MSA</span>
                      <ArabicText text={msaEquiv} />
                    </div>
                  )}
                  {s.meaning && (
                    <div className="flex gap-2">
                      <span className="text-xs text-muted w-16 shrink-0 pt-0.5">English</span>
                      <span>{s.meaning}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {s.expressions.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-muted mb-2">Extracted language</h3>
                <div className="space-y-2">
                  {s.expressions.map((e) => (
                    <Link
                      key={e.expression.id}
                      href={`/words/${e.expression.id}`}
                      className="flex items-center justify-between py-1 hover:bg-foreground/5 rounded px-2 -mx-2"
                    >
                      <ArabicText text={e.expression.textOriginal} className="text-base font-medium" />
                      <span className="text-xs text-muted">{e.expression.dialect?.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {otherEquivalents.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-muted mb-2">Equivalent utterances</h3>
                <p className="text-xs text-muted mb-2">
                  Natural realizations of the same meaning across dialects/languages — not literal translations.
                </p>
                <div className="space-y-1.5">
                  {otherEquivalents.map((eq) => (
                    <Link key={eq.id} href={`/sentences/${eq.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                      <ArabicText text={eq.textOriginal} className="text-base" />
                      <span className="text-xs text-muted">{eq.dialect?.name ?? eq.language.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {s.pronunciations.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-muted mb-2">Pronunciation</h3>
                <div className="space-y-2">
                  {s.pronunciations.map((p) => (
                    <div key={p.id} className="border border-border rounded-lg p-3 text-sm">
                      {p.arabicPhonetic && <ArabicText text={p.arabicPhonetic} className="block text-base" />}
                      {p.ipa && <span className="text-muted font-mono text-xs">/{p.ipa}/</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">History</h3>
              <RevisionHistory entityType="sentence" entityId={id} restorable onRestored={refetch} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">Context</h3>
              <dl className="text-sm space-y-1.5">
                {s.intent && (
                  <div className="flex justify-between"><dt className="text-muted">Intent</dt><dd>{s.intent.name.replaceAll("_", " ")}</dd></div>
                )}
                {s.register && (
                  <div className="flex justify-between"><dt className="text-muted">Register</dt><dd>{s.register.name}</dd></div>
                )}
                {s.naturalness !== "UNKNOWN" && (
                  <div className="flex justify-between"><dt className="text-muted">Naturalness</dt><dd>{s.naturalness.charAt(0) + s.naturalness.slice(1).toLowerCase()}</dd></div>
                )}
                {s.situation && (
                  <div className="flex justify-between"><dt className="text-muted">Situation</dt><dd>{s.situation.name}</dd></div>
                )}
                {!s.intent && !s.register && s.naturalness === "UNKNOWN" && !s.situation && (
                  <p className="text-xs text-muted">Not enough context to determine intent, register, or situation.</p>
                )}
              </dl>
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">Provenance</h3>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-muted">Origin</dt><dd><Badge value={s.origin} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{s.source?.name ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Language</dt><dd>{s.language.name}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SentenceEditForm({ sentence: s, onSaved }: { sentence: SentenceDetail; onSaved: () => void }) {
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
