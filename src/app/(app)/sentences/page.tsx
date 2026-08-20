"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi, useDebounced } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button, Select, Pagination } from "@/components/ui";
import { BulkBar } from "@/components/BulkBar";
import { SavedViewsBar } from "@/components/SavedViewsBar";
import { CreateSentenceModal } from "@/components/CreateSentenceModal";

interface SentenceRow {
  id: string;
  textOriginal: string;
  meaning: string | null;
  quality: string;
  verification: string;
  origin: string;
  naturalness: string;
  commonness: string;
  dialect: { name: string } | null;
  language: { name: string };
  intent: { name: string } | null;
  situation: { name: string } | null;
  utteranceGroup: { id: string; name: string } | null;
  _count: { pronunciations: number; conversationTurns: number };
}

export default function SentencesPage() {
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

  const { data, loading, refetch } = useApi<{ items: SentenceRow[]; total: number }>(`/api/sentences?${query}`);

  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Sentences" subtitle="Natural spoken sentences — the primary training asset" actions={<Button onClick={() => setShowCreate(true)}>+ New sentence</Button>} />

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Input className="max-w-xs" dir="auto" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {lookups && (
          <>
            <Select value={filters.dialectId ?? ""} onChange={(e) => setFilter("dialectId", e.target.value)}>
              <option value="">All dialects</option>
              {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
            <Select value={filters.quality ?? ""} onChange={(e) => setFilter("quality", e.target.value)}>
              <option value="">Any quality</option>
              {["GOLD", "SILVER", "REFERENCE", "CANDIDATE"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select value={filters.verification ?? ""} onChange={(e) => setFilter("verification", e.target.value)}>
              <option value="">Any verification</option>
              {["VERIFIED", "UNVERIFIED", "REJECTED"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select value={filters.intentId ?? ""} onChange={(e) => setFilter("intentId", e.target.value)}>
              <option value="">Any intent</option>
              {lookups.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
            <Select value={filters.situationId ?? ""} onChange={(e) => setFilter("situationId", e.target.value)}>
              <option value="">Any situation</option>
              {lookups.situations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={filters.hasPronunciation ?? ""} onChange={(e) => setFilter("hasPronunciation", e.target.value)}>
              <option value="">Pronunciation: any</option>
              <option value="true">Has pronunciation</option>
              <option value="false">Missing pronunciation</option>
            </Select>
          </>
        )}
        <SavedViewsBar viewKey="sentences" filters={{ q, ...filters }} onApply={(f) => {
          setQ((f.q as string) ?? "");
          const rest = { ...(f as Record<string, string>) };
          delete rest.q;
          setFilters(rest);
          setPage(1);
        }} />
      </div>

      {selected.size > 0 && (
        <BulkBar entityType="sentence" ids={[...selected]} onDone={() => { setSelected(new Set()); void refetch(); }} />
      )}

      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No sentences found" hint="Create one or import a file" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === data.items.length} onChange={(e) => setSelected(e.target.checked ? new Set(data.items.map((i) => i.id)) : new Set())} />
                </th>
                <th className="p-2 text-start">Sentence</th>
                <th className="p-2 text-start">Dialect</th>
                <th className="p-2 text-start">Intent / Situation</th>
                <th className="p-2 text-start">Group</th>
                <th className="p-2 text-start">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-foreground/5">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(ev) => {
                        const next = new Set(selected);
                        if (ev.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="p-2 max-w-md">
                    <Link href={`/sentences/${s.id}`} className="hover:text-accent">
                      <ArabicText text={s.textOriginal} className="text-base" />
                    </Link>
                    {s.meaning && <div className="text-[11px] text-muted truncate">{s.meaning}</div>}
                  </td>
                  <td className="p-2">{s.dialect?.name ?? s.language.name}</td>
                  <td className="p-2 text-xs text-muted">{[s.intent?.name, s.situation?.name].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-2">
                    {s.utteranceGroup ? (
                      <Link href={`/sentences/groups/${s.utteranceGroup.id}`} className="text-xs text-accent hover:underline">
                        {s.utteranceGroup.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="p-2">
                    <span className="flex gap-1 flex-wrap">
                      <Badge value={s.quality} />
                      <Badge value={s.verification} />
                      {s._count.pronunciations > 0 && <span title="pronunciation" className="text-xs">🔊</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />}

      {showCreate && <CreateSentenceModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refetch(); }} />}
    </div>
  );
}

