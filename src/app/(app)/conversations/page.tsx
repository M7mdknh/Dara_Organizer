"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi, useDebounced } from "@/lib/client";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button, Select, Pagination } from "@/components/ui";

interface ConversationRow {
  id: string;
  title: string;
  quality: string;
  verification: string;
  dialect: { name: string } | null;
  situation: { name: string } | null;
  turns: { id: string; speaker: string; textOriginal: string }[];
  _count: { turns: number };
}

export default function ConversationsPage() {
  const lookups = useLookups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [dialectId, setDialectId] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "24" });
    if (dq) p.set("q", dq);
    if (dialectId) p.set("dialectId", dialectId);
    return p.toString();
  }, [dq, dialectId, page]);

  const { data, loading } = useApi<{ items: ConversationRow[]; total: number }>(`/api/conversations?${query}`);

  return (
    <div>
      <PageHeader title="Conversations" subtitle="Multi-turn dialogue for realistic voice training" actions={<Link href="/conversations/new"><Button>+ New conversation</Button></Link>} />
      <div className="flex gap-2 mb-4">
        <Input className="max-w-xs" dir="auto" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {lookups && (
          <Select value={dialectId} onChange={(e) => { setDialectId(e.target.value); setPage(1); }}>
            <option value="">All dialects</option>
            {dialectOptions(lookups.dialects).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        )}
      </div>
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No conversations yet" hint="Create a multi-turn dialogue" />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.items.map((c) => (
            <Link key={c.id} href={`/conversations/${c.id}`} className="card p-4 hover:border-accent transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{c.title}</h3>
                <span className="flex gap-1.5">
                  <Badge value={c.quality} />
                  <Badge value={c.verification} />
                </span>
              </div>
              <div className="text-xs text-muted mb-2">
                {c.dialect?.name ?? "No dialect"} {c.situation ? `· ${c.situation.name}` : ""} · {c._count.turns} turns
              </div>
              <div className="space-y-0.5">
                {c.turns.slice(0, 3).map((t) => (
                  <div key={t.id} className="text-sm truncate">
                    <span className="text-muted text-xs me-1">{t.speaker}:</span>
                    <ArabicText text={t.textOriginal} />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
      {data && <Pagination page={page} pageSize={24} total={data.total} onPage={setPage} />}
    </div>
  );
}
