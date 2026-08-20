"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, useApi, useDebounced } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button, Select, Field, Modal, Pagination } from "@/components/ui";
import { BulkBar } from "@/components/BulkBar";
import { SavedViewsBar } from "@/components/SavedViewsBar";
import { CreateExpressionModal } from "@/components/CreateExpressionModal";

interface ExpressionRow {
  id: string;
  textOriginal: string;
  meaningNote: string | null;
  type: string;
  commonness: string;
  quality: string;
  verification: string;
  origin: string;
  training: string;
  dialect: { name: string } | null;
  language: { name: string; code: string };
  register: { name: string } | null;
  concepts: { concept: { id: string; key: string } }[];
  _count: { pronunciations: number; sentences: number; relationsFrom: number };
}

interface ConceptRow {
  id: string;
  key: string;
  gloss: string;
  expressions: { expression: { id: string; textOriginal: string; dialect: { name: string } | null; language: { name: string } } }[];
  _count: { sentences: number };
}

function WordsContent() {
  const tab = useSearchParams().get("tab") === "concepts" ? "concepts" : "expressions";
  const lookups = useLookups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (dq) p.set("q", dq);
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p.toString();
  }, [dq, filters, page]);

  const expressions = useApi<{ items: ExpressionRow[]; total: number }>(
    tab === "expressions" ? `/api/expressions?${query}` : null,
  );
  const concepts = useApi<{ items: ConceptRow[]; total: number }>(
    tab === "concepts" ? `/api/concepts?${query}` : null,
  );

  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Words & Expressions"
        subtitle="Expressions, synonyms, variants, fillers, and the concepts behind them"
        actions={
          <>
            <Link href="/words?tab=expressions">
              <Button variant={tab === "expressions" ? "primary" : "secondary"}>Expressions</Button>
            </Link>
            <Link href="/words?tab=concepts">
              <Button variant={tab === "concepts" ? "primary" : "secondary"}>Concepts</Button>
            </Link>
            <Button onClick={() => setShowCreate(true)}>+ New {tab === "concepts" ? "concept" : "expression"}</Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Input className="max-w-xs" dir="auto" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {tab === "expressions" && lookups && (
          <>
            <Select value={filters.dialectId ?? ""} onChange={(e) => setFilter("dialectId", e.target.value)}>
              <option value="">All dialects</option>
              {dialectOptions(lookups.dialects).map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </Select>
            <Select value={filters.languageId ?? ""} onChange={(e) => setFilter("languageId", e.target.value)}>
              <option value="">All languages</option>
              {lookups.languages.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
            <Select value={filters.quality ?? ""} onChange={(e) => setFilter("quality", e.target.value)}>
              <option value="">Any quality</option>
              {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select value={filters.verification ?? ""} onChange={(e) => setFilter("verification", e.target.value)}>
              <option value="">Any verification</option>
              {["VERIFIED", "UNVERIFIED", "REJECTED"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select value={filters.type ?? ""} onChange={(e) => setFilter("type", e.target.value)}>
              <option value="">Any type</option>
              {["WORD", "PHRASE", "IDIOM", "SLANG", "GREETING", "FORMULA", "FILLER", "DISCOURSE_MARKER", "EXPRESSION"].map((x) => (
                <option key={x} value={x}>{x.replaceAll("_", " ")}</option>
              ))}
            </Select>
            <Select value={filters.origin ?? ""} onChange={(e) => setFilter("origin", e.target.value)}>
              <option value="">Any origin</option>
              {["HUMAN", "IMPORT", "AI", "REFERENCE"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </>
        )}
        <SavedViewsBar viewKey={`words-${tab}`} filters={{ q, ...filters }} onApply={(f) => {
          setQ((f.q as string) ?? "");
          const rest = { ...(f as Record<string, string>) };
          delete rest.q;
          setFilters(rest);
          setPage(1);
        }} />
      </div>

      {tab === "expressions" && (
        <>
          {selected.size > 0 && (
            <BulkBar
              entityType="expression"
              ids={[...selected]}
              onDone={() => {
                setSelected(new Set());
                void expressions.refetch();
              }}
            />
          )}
          {expressions.loading ? (
            <Spinner />
          ) : !expressions.data?.items.length ? (
            <EmptyState title="No expressions found" hint="Create one or import a file" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted">
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === expressions.data.items.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(expressions.data!.items.map((i) => i.id)) : new Set())
                        }
                      />
                    </th>
                    <th className="p-2 text-start">Expression</th>
                    <th className="p-2 text-start">Meaning</th>
                    <th className="p-2 text-start">Dialect</th>
                    <th className="p-2 text-start">Concept</th>
                    <th className="p-2 text-start">Status</th>
                    <th className="p-2 text-start">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {expressions.data.items.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-foreground/5">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(e.id)}
                          onChange={(ev) => {
                            const next = new Set(selected);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Link href={`/words/${e.id}`} className="hover:text-accent">
                          <ArabicText text={e.textOriginal} className="text-base font-medium" />
                        </Link>
                        <div className="text-[11px] text-muted">{e.type.replaceAll("_", " ").toLowerCase()} · {e.language.name}</div>
                      </td>
                      <td className="p-2 text-muted max-w-52 truncate">{e.meaningNote}</td>
                      <td className="p-2">{e.dialect?.name ?? "—"}</td>
                      <td className="p-2">
                        {e.concepts.map((c) => (
                          <Link key={c.concept.id} href={`/words/concepts/${c.concept.id}`} className="font-mono text-[10px] bg-foreground/10 rounded px-1.5 py-0.5 me-1 hover:bg-accent/20">
                            {c.concept.key}
                          </Link>
                        ))}
                      </td>
                      <td className="p-2">
                        <span className="flex gap-1 flex-wrap">
                          <Badge value={e.quality} />
                          <Badge value={e.verification} />
                          <Badge value={e.origin} />
                        </span>
                      </td>
                      <td className="p-2 text-xs text-muted whitespace-nowrap">
                        {e._count.pronunciations > 0 && <span title="pronunciations">🔊 {e._count.pronunciations} </span>}
                        {e._count.sentences > 0 && <span title="sentences">≣ {e._count.sentences} </span>}
                        {e._count.relationsFrom > 0 && <span title="relations">⇄ {e._count.relationsFrom}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {expressions.data && (
            <Pagination page={page} pageSize={50} total={expressions.data.total} onPage={setPage} />
          )}
        </>
      )}

      {tab === "concepts" && (
        <>
          {concepts.loading ? (
            <Spinner />
          ) : !concepts.data?.items.length ? (
            <EmptyState title="No concepts found" />
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {concepts.data.items.map((c) => (
                <Link key={c.id} href={`/words/concepts/${c.id}`} className="card p-4 hover:border-accent transition-colors">
                  <div className="font-mono text-xs bg-foreground/10 rounded px-1.5 py-0.5 inline-block mb-1">{c.key}</div>
                  <div className="text-sm font-medium mb-2">{c.gloss}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.expressions.slice(0, 6).map((e) => (
                      <span key={e.expression.id} className="text-xs bg-foreground/5 rounded-full px-2 py-0.5">
                        <ArabicText text={e.expression.textOriginal} />
                        <span className="text-muted ms-1">{e.expression.dialect?.name ?? e.expression.language.name}</span>
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted mt-2">{c._count.sentences} linked sentences</div>
                </Link>
              ))}
            </div>
          )}
          {concepts.data && <Pagination page={page} pageSize={50} total={concepts.data.total} onPage={setPage} />}
        </>
      )}

      {showCreate && tab === "expressions" && (
        <CreateExpressionModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void expressions.refetch(); }} />
      )}
      {showCreate && tab === "concepts" && (
        <CreateConceptModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void concepts.refetch(); }} />
      )}
    </div>
  );
}

function CreateConceptModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [gloss, setGloss] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="New concept" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await api("/api/concepts", { method: "POST", json: { key: key.toUpperCase().replaceAll(" ", "_"), gloss, description: description || null } });
            onCreated();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
            setSaving(false);
          }
        }}
      >
        <Field label="Key (UPPER_SNAKE_CASE, e.g. TIME_NOW)">
          <Input value={key} onChange={(e) => setKey(e.target.value)} required placeholder="TIME_NOW" />
        </Field>
        <Field label="Meaning / gloss">
          <Input value={gloss} onChange={(e) => setGloss(e.target.value)} required placeholder="at the present time" />
        </Field>
        <Field label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create concept"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function WordsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <WordsContent />
    </Suspense>
  );
}
