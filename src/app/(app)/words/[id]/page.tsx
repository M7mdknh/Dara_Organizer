"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import {
  PageHeader,
  Spinner,
  Badge,
  ArabicText,
  EmptyState,
  Input,
  Textarea,
  Button,
  Select,
  Field,
  Modal,
  confirmDanger,
} from "@/components/ui";
import { RevisionHistory } from "@/components/RevisionHistory";

interface ExpressionDetail {
  id: string;
  textOriginal: string;
  meaningNote: string | null;
  usageNote: string | null;
  type: string;
  commonness: string;
  quality: string;
  verification: string;
  training: string;
  trainingNote: string | null;
  origin: string;
  status: string;
  dialect: { id: string; name: string } | null;
  language: { id: string; name: string };
  register: { id: string; name: string } | null;
  source: { id: string; name: string } | null;
  concepts: { concept: { id: string; key: string; gloss: string } }[];
  categories: { category: { id: string; name: string } }[];
  pronunciations: { id: string; arabicPhonetic: string | null; diacritized: string | null; ipa: string | null; notes: string | null; verification: string; dialect: { name: string } | null }[];
  relationsFrom: { id: string; type: string; notes: string | null; to: { id: string; textOriginal: string; dialect: { name: string } | null; language: { name: string } } }[];
  relationsTo: { id: string; type: string; from: { id: string; textOriginal: string; dialect: { name: string } | null } }[];
  sentences: { sentence: { id: string; textOriginal: string; dialect: { name: string } | null } }[];
}

const TABS = ["Overview", "Relations", "Pronunciation", "Sentences", "History"] as const;

export default function ExpressionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: ExpressionDetail }>(`/api/expressions/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Expression not found" />;
  const e = data.item;

  return (
    <div>
      <PageHeader
        title={e.textOriginal}
        subtitle={e.meaningNote ?? undefined}
        actions={
          <>
            <Badge value={e.quality} />
            <Badge value={e.verification} />
            <Badge value={e.origin} />
            {e.status === "REJECTED" && <Badge value="REJECTED" />}
          </>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab expression={e} onSaved={refetch} />}
      {tab === "Relations" && <RelationsTab expression={e} onSaved={refetch} />}
      {tab === "Pronunciation" && <PronunciationTab expression={e} onSaved={refetch} />}
      {tab === "Sentences" && (
        <div className="card p-4">
          {e.sentences.length === 0 ? (
            <EmptyState title="No linked sentences yet" />
          ) : (
            <div className="space-y-1">
              {e.sentences.map((s) => (
                <Link key={s.sentence.id} href={`/sentences/${s.sentence.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                  <ArabicText text={s.sentence.textOriginal} />
                  <span className="text-xs text-muted">{s.sentence.dialect?.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === "History" && (
        <div className="card p-4">
          <RevisionHistory entityType="expression" entityId={id} restorable onRestored={refetch} />
        </div>
      )}
    </div>
  );
}

function OverviewTab({ expression: e, onSaved }: { expression: ExpressionDetail; onSaved: () => void }) {
  const lookups = useLookups();
  const [form, setForm] = useState({
    textOriginal: e.textOriginal,
    meaningNote: e.meaningNote ?? "",
    usageNote: e.usageNote ?? "",
    dialectId: e.dialect?.id ?? "",
    registerId: e.register?.id ?? "",
    commonness: e.commonness,
    quality: e.quality,
    training: e.training,
    trainingNote: e.trainingNote ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/expressions/${e.id}`, {
        method: "PATCH",
        json: {
          textOriginal: form.textOriginal,
          meaningNote: form.meaningNote || null,
          usageNote: form.usageNote || null,
          dialectId: form.dialectId || null,
          registerId: form.registerId || null,
          commonness: form.commonness,
          quality: form.quality,
          training: form.training,
          trainingNote: form.trainingNote || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    await api(`/api/expressions/${e.id}`, { method: "PATCH", json: { verification: "VERIFIED" } });
    onSaved();
  }

  async function remove() {
    if (!confirmDanger(`Delete "${e.textOriginal}"? This cannot be undone from the UI.`)) return;
    await api(`/api/expressions/${e.id}`, { method: "DELETE" });
    window.location.href = "/words";
  }

  if (!lookups) return <Spinner />;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 card p-4 space-y-3">
        <Field label="Text">
          <Input dir="auto" className="text-lg" value={form.textOriginal} onChange={(ev) => setForm((f) => ({ ...f, textOriginal: ev.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dialect">
            <Select className="w-full" value={form.dialectId} onChange={(ev) => setForm((f) => ({ ...f, dialectId: ev.target.value }))}>
              <option value="">None</option>
              {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Register">
            <Select className="w-full" value={form.registerId} onChange={(ev) => setForm((f) => ({ ...f, registerId: ev.target.value }))}>
              <option value="">None</option>
              {lookups.registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Commonness (human estimate)">
            <Select className="w-full" value={form.commonness} onChange={(ev) => setForm((f) => ({ ...f, commonness: ev.target.value }))}>
              {["VERY_HIGH", "HIGH", "MEDIUM", "LOW", "RARE", "CONTEXTUAL", "UNKNOWN"].map((c) => (
                <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quality tier">
            <Select className="w-full" value={form.quality} onChange={(ev) => setForm((f) => ({ ...f, quality: ev.target.value }))}>
              {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((q) => <option key={q} value={q}>{q}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Meaning note">
          <Input value={form.meaningNote} onChange={(ev) => setForm((f) => ({ ...f, meaningNote: ev.target.value }))} />
        </Field>
        <Field label="Usage note">
          <Textarea rows={2} value={form.usageNote} onChange={(ev) => setForm((f) => ({ ...f, usageNote: ev.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Training eligibility">
            <Select className="w-full" value={form.training} onChange={(ev) => setForm((f) => ({ ...f, training: ev.target.value }))}>
              {["ELIGIBLE", "NOT_ELIGIBLE", "UNDECIDED"].map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Training note">
            <Input value={form.trainingNote} onChange={(ev) => setForm((f) => ({ ...f, trainingNote: ev.target.value }))} />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between pt-2">
          <Button variant="danger" onClick={remove}>Delete</Button>
          <div className="flex gap-2">
            {e.verification !== "VERIFIED" && <Button variant="secondary" onClick={verify}>Mark verified</Button>}
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Concepts</h3>
          {e.concepts.length === 0 ? (
            <p className="text-sm text-muted">Not linked to a concept</p>
          ) : (
            e.concepts.map((c) => (
              <Link key={c.concept.id} href={`/words/concepts/${c.concept.id}`} className="block text-sm hover:text-accent py-0.5">
                <span className="font-mono text-xs bg-foreground/10 rounded px-1.5 py-0.5 me-1.5">{c.concept.key}</span>
                {c.concept.gloss}
              </Link>
            ))
          )}
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Provenance</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted">Origin</dt><dd><Badge value={e.origin} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{e.source?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Language</dt><dd>{e.language.name}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}

const RELATION_TYPES = [
  "SYNONYM",
  "NEAR_SYNONYM",
  "DIALECT_EQUIVALENT",
  "TRANSLATION",
  "REGIONAL_VARIANT",
  "SPELLING_VARIANT",
  "PRONUNCIATION_VARIANT",
  "FORMAL_EQUIVALENT",
  "INFORMAL_EQUIVALENT",
  "SLANG_EQUIVALENT",
  "RELATED",
  "COMMON_RESPONSE",
];

function RelationsTab({ expression: e, onSaved }: { expression: ExpressionDetail; onSaved: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-muted">Synonyms, variants & related expressions</h3>
        <Button onClick={() => setShowAdd(true)}>+ Add relation</Button>
      </div>
      {e.relationsFrom.length === 0 && e.relationsTo.length === 0 ? (
        <EmptyState title="No relations yet" hint="Link synonyms, dialect equivalents, or variants" />
      ) : (
        <div className="space-y-1">
          {e.relationsFrom.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm">
              <span>
                <Badge value="RELATION" label={r.type.replaceAll("_", " ")} />
                <Link href={`/words/${r.to.id}`} className="ms-2 hover:text-accent">
                  <ArabicText text={r.to.textOriginal} />
                </Link>
                <span className="text-xs text-muted ms-2">{r.to.dialect?.name ?? r.to.language.name}</span>
              </span>
            </div>
          ))}
          {e.relationsTo.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm">
              <span className="text-muted text-xs">
                <Link href={`/words/${r.from.id}`} className="hover:text-accent"><ArabicText text={r.from.textOriginal} /></Link>
                {" "}is a {r.type.replaceAll("_", " ").toLowerCase()} of this
              </span>
            </div>
          ))}
        </div>
      )}
      {showAdd && <AddRelationModal expressionId={e.id} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onSaved(); }} />}
    </div>
  );
}

function AddRelationModal({ expressionId, onClose, onSaved }: { expressionId: string; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const [toId, setToId] = useState("");
  const [type, setType] = useState("SYNONYM");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const results = useApi<{ items: { id: string; textOriginal: string; dialect: { name: string } | null }[] }>(
    q.length > 1 ? `/api/expressions?q=${encodeURIComponent(q)}&pageSize=10` : null,
  );

  return (
    <Modal title="Add relation" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!toId) return;
          setSaving(true);
          try {
            await api(`/api/expressions/${expressionId}/relations`, { method: "POST", json: { toId, type, notes: notes || null } });
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Relation type">
          <Select className="w-full" value={type} onChange={(e) => setType(e.target.value)}>
            {RELATION_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
          </Select>
        </Field>
        <Field label="Search for the related expression">
          <Input dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
        </Field>
        {results.data?.items.map((r) => (
          <button
            type="button"
            key={r.id}
            onClick={() => setToId(r.id)}
            className={`block w-full text-start px-2 py-1.5 rounded text-sm ${toId === r.id ? "bg-accent/10 border border-accent" : "hover:bg-foreground/5 border border-transparent"}`}
          >
            <ArabicText text={r.textOriginal} /> <span className="text-xs text-muted">{r.dialect?.name}</span>
          </button>
        ))}
        <Field label="Notes (optional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !toId}>{saving ? "Saving…" : "Add relation"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PronunciationTab({ expression: e, onSaved }: { expression: ExpressionDetail; onSaved: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-muted">Pronunciation</h3>
        <Button onClick={() => setShowAdd(true)}>+ Add pronunciation</Button>
      </div>
      {e.pronunciations.length === 0 ? (
        <EmptyState title="No pronunciation recorded" />
      ) : (
        <div className="space-y-2">
          {e.pronunciations.map((p) => (
            <div key={p.id} className="border border-border rounded-lg p-3 text-sm flex justify-between">
              <div>
                {p.arabicPhonetic && <ArabicText text={p.arabicPhonetic} className="block text-base" />}
                {p.ipa && <span className="text-muted font-mono text-xs block">/{p.ipa}/</span>}
                {p.notes && <span className="text-xs text-muted block mt-1">{p.notes}</span>}
              </div>
              <div className="text-end">
                <Badge value={p.verification} />
                {p.dialect && <div className="text-xs text-muted mt-1">{p.dialect.name}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <AddPronunciationModal expressionId={e.id} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onSaved(); }} />
      )}
    </div>
  );
}

function AddPronunciationModal({ expressionId, onClose, onSaved }: { expressionId: string; onClose: () => void; onSaved: () => void }) {
  const lookups = useLookups();
  const [form, setForm] = useState({ arabicPhonetic: "", diacritized: "", ipa: "", notes: "", dialectId: "" });
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Add pronunciation" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api("/api/pronunciations", {
              method: "POST",
              json: { expressionId, ...form, dialectId: form.dialectId || null },
            });
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Pronunciation-oriented Arabic">
          <Input dir="auto" value={form.arabicPhonetic} onChange={(e) => setForm((f) => ({ ...f, arabicPhonetic: e.target.value }))} />
        </Field>
        <Field label="Diacritized form">
          <Input dir="auto" value={form.diacritized} onChange={(e) => setForm((f) => ({ ...f, diacritized: e.target.value }))} />
        </Field>
        <Field label="IPA">
          <Input value={form.ipa} onChange={(e) => setForm((f) => ({ ...f, ipa: e.target.value }))} />
        </Field>
        <Field label="Dialect">
          <Select className="w-full" value={form.dialectId} onChange={(e) => setForm((f) => ({ ...f, dialectId: e.target.value }))}>
            <option value="">Same as expression</option>
            {lookups && dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
