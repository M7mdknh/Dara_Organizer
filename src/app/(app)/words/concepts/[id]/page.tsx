"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Textarea, Button, Field, confirmDanger } from "@/components/ui";
import { RevisionHistory } from "@/components/RevisionHistory";
import { CreateExpressionModal } from "@/components/CreateExpressionModal";

interface ConceptDetail {
  id: string;
  key: string;
  gloss: string;
  canonicalMsa: string | null;
  description: string | null;
  notes: string | null;
  source: { id: string; name: string } | null;
  expressions: {
    expression: {
      id: string;
      textOriginal: string;
      commonness: string;
      quality: string;
      dialect: { name: string } | null;
      language: { name: string };
      register: { name: string } | null;
      pronunciations: { id: string; arabicPhonetic: string | null }[];
    };
  }[];
  sentences: { sentence: { id: string; textOriginal: string; dialect: { name: string } | null; utteranceGroup: { name: string } | null } }[];
}

// Group expressions by dialect (or language, for non-Arabic) for a concept tree view.
function groupByDialect(expressions: ConceptDetail["expressions"]) {
  const groups = new Map<string, typeof expressions>();
  for (const e of expressions) {
    const key = e.expression.dialect?.name ?? e.expression.language.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return [...groups.entries()];
}

export default function ConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: ConceptDetail }>(`/api/concepts/${id}`);
  const [editing, setEditing] = useState(false);
  const [showAddExpression, setShowAddExpression] = useState(false);

  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Concept not found" />;
  const c = data.item;

  return (
    <div>
      <PageHeader
        title={c.gloss}
        subtitle={c.canonicalMsa ? `${c.key} · MSA: ${c.canonicalMsa}` : c.key}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button onClick={() => setShowAddExpression(true)}>+ Add expression</Button>
          </>
        }
      />

      {editing && <EditConceptForm concept={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-muted mb-3">Realizations across dialects & languages</h3>
            {c.expressions.length === 0 ? (
              <EmptyState title="No expressions linked yet" hint="Add the MSA form and dialect equivalents" />
            ) : (
              <div className="space-y-3">
                {groupByDialect(c.expressions).map(([dialect, exprs]) => (
                  <div key={dialect}>
                    <div className="text-xs font-medium text-muted mb-1">{dialect}</div>
                    <div className="flex flex-wrap gap-2">
                      {exprs.map((e) => (
                        <Link
                          key={e.expression.id}
                          href={`/words/${e.expression.id}`}
                          className="border border-border rounded-lg px-3 py-1.5 hover:border-accent flex items-center gap-2"
                        >
                          <ArabicText text={e.expression.textOriginal} className="text-base" />
                          {e.expression.pronunciations[0]?.arabicPhonetic && (
                            <span className="text-xs text-muted">🔊</span>
                          )}
                          <Badge value={e.expression.quality} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-muted mb-3">Sentences using this concept</h3>
            {c.sentences.length === 0 ? (
              <EmptyState title="No linked sentences" />
            ) : (
              <div className="space-y-1">
                {c.sentences.map((s) => (
                  <Link key={s.sentence.id} href={`/sentences/${s.sentence.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                    <ArabicText text={s.sentence.textOriginal} />
                    <span className="text-xs text-muted">{s.sentence.dialect?.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-muted mb-3">History</h3>
            <RevisionHistory entityType="concept" entityId={id} restorable onRestored={refetch} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-muted mb-2">Details</h3>
            {c.description && <p className="text-sm mb-2">{c.description}</p>}
            {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
            <dl className="text-sm mt-3 space-y-1">
              <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{c.source?.name ?? "Manual"}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      {showAddExpression && (
        <CreateExpressionModal
          defaultConceptId={id}
          onClose={() => setShowAddExpression(false)}
          onCreated={() => { setShowAddExpression(false); refetch(); }}
        />
      )}
    </div>
  );
}

function EditConceptForm({ concept, onClose, onSaved }: { concept: ConceptDetail; onClose: () => void; onSaved: () => void }) {
  const [gloss, setGloss] = useState(concept.gloss);
  const [canonicalMsa, setCanonicalMsa] = useState(concept.canonicalMsa ?? "");
  const [description, setDescription] = useState(concept.description ?? "");
  const [notes, setNotes] = useState(concept.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="card p-4 mb-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api(`/api/concepts/${concept.id}`, { method: "PATCH", json: { gloss, canonicalMsa: canonicalMsa || null, description: description || null, notes: notes || null } });
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Meaning / gloss">
          <Input value={gloss} onChange={(e) => setGloss(e.target.value)} required />
        </Field>
        <Field label="Canonical MSA form">
          <Input dir="rtl" value={canonicalMsa} onChange={(e) => setCanonicalMsa(e.target.value)} placeholder="الآن" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-between">
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              if (!confirmDanger(`Delete concept "${concept.key}"? Linked expressions will remain but lose this concept link.`)) return;
              await api(`/api/concepts/${concept.id}`, { method: "DELETE" });
              window.location.href = "/words?tab=concepts";
            }}
          >
            Delete concept
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
