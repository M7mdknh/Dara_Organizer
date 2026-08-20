"use client";

import { use } from "react";
import Link from "next/link";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState } from "@/components/ui";

interface DialectStats {
  dialect: { id: string; name: string; nameAr: string | null };
  counts: { expressions: number; sentences: number; conversations: number; responsePatterns: number };
  pronunciationCoverage: { expressions: number; sentences: number };
  qualityBreakdown: Record<string, number>;
  categoryDistribution: { name: string; count: number }[];
  recent: { id: string; textOriginal: string; createdAt: string }[];
}

export default function DialectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading } = useApi<DialectStats>(`/api/dialects/${id}/stats`);
  if (loading || !data) return <Spinner />;

  const maxCat = Math.max(1, ...data.categoryDistribution.map((c) => c.count));

  return (
    <div>
      <PageHeader title={data.dialect.name} subtitle={data.dialect.nameAr ?? undefined} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {Object.entries(data.counts).map(([k, v]) => (
          <Link key={k} href={k === "sentences" ? `/sentences?dialectId=${id}` : k === "expressions" ? `/words?dialectId=${id}` : "#"} className="card p-4 hover:border-accent">
            <div className="text-2xl font-semibold">{v.toLocaleString()}</div>
            <div className="text-xs text-muted mt-1 capitalize">{k.replace(/([A-Z])/g, " $1")}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-3">Quality distribution (sentences)</h3>
          {Object.keys(data.qualityBreakdown).length === 0 ? (
            <EmptyState title="No sentences yet" />
          ) : (
            (["GOLD", "SILVER", "REFERENCE", "CANDIDATE"] as const).map((q) => (
              <div key={q} className="flex justify-between py-1 text-sm">
                <Badge value={q} />
                <span>{(data.qualityBreakdown[q] ?? 0).toLocaleString()}</span>
              </div>
            ))
          )}
          <div className="mt-3 pt-3 border-t border-border text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted">Expression pronunciation</span><span>{Math.round(data.pronunciationCoverage.expressions * 100)}%</span></div>
            <div className="flex justify-between"><span className="text-muted">Sentence pronunciation</span><span>{Math.round(data.pronunciationCoverage.sentences * 100)}%</span></div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-3">Category distribution</h3>
          {data.categoryDistribution.length === 0 ? (
            <EmptyState title="No categorized sentences yet" />
          ) : (
            <div className="space-y-1.5">
              {data.categoryDistribution.map((c) => (
                <div key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="w-32 truncate">{c.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs text-muted">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted mb-3">Recently added sentences</h3>
          {data.recent.length === 0 ? (
            <EmptyState title="Nothing yet" />
          ) : (
            <div className="space-y-1">
              {data.recent.map((s) => (
                <Link key={s.id} href={`/sentences/${s.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                  <ArabicText text={s.textOriginal} />
                  <span className="text-xs text-muted">{new Date(s.createdAt).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
