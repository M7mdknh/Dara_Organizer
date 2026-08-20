"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, EmptyState } from "@/components/ui";

interface Stats {
  totals: {
    concepts: number;
    expressions: number;
    sentences: number;
    conversations: number;
    responsePatterns: number;
    reviewPending: number;
    verifiedSentences: number;
  };
  pronunciationCoverage: { sentences: number; expressions: number };
  dialectDistribution: { name: string; dialectId: string | null; count: number }[];
  languageDistribution: { name: string; count: number }[];
  qualityDistribution: {
    sentences: Record<string, number>;
    expressions: Record<string, number>;
  };
  conversationalCoverage: { id: string; name: string; count: number }[];
  recentImports: {
    id: string;
    filename: string | null;
    status: string;
    accepted: number;
    matched: number;
    conflicts: number;
    errors: number;
    createdAt: string;
    source: { name: string };
  }[];
}

function coverageLabel(count: number, max: number): { label: string; cls: string } {
  if (max === 0 || count === 0) return { label: "Very weak", cls: "text-red-600" };
  const ratio = count / max;
  if (ratio > 0.6) return { label: "Excellent", cls: "text-green-600" };
  if (ratio > 0.35) return { label: "Good", cls: "text-emerald-600" };
  if (ratio > 0.15) return { label: "Medium", cls: "text-amber-600" };
  if (ratio > 0.05) return { label: "Weak", cls: "text-orange-600" };
  return { label: "Very weak", cls: "text-red-600" };
}

export default function DashboardPage() {
  const { data, loading } = useApi<Stats>("/api/stats");
  if (loading || !data) return <Spinner />;
  const t = data.totals;
  const maxCoverage = Math.max(1, ...data.conversationalCoverage.map((c) => c.count));
  const maxDialect = Math.max(1, ...data.dialectDistribution.map((d) => d.count));

  const cards = [
    { label: "Concepts", value: t.concepts, href: "/words?tab=concepts" },
    { label: "Expressions", value: t.expressions, href: "/words" },
    { label: "Sentences", value: t.sentences, href: "/sentences" },
    { label: "Conversations", value: t.conversations, href: "/conversations" },
    { label: "Response patterns", value: t.responsePatterns, href: "/responses" },
    { label: "Pending review", value: t.reviewPending, href: "/review" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Corpus health and collection priorities" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-4 hover:border-accent transition-colors">
            <div className="text-2xl font-semibold">{c.value.toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Conversational coverage</h2>
          {data.conversationalCoverage.length === 0 ? (
            <EmptyState title="No conversational functions defined" hint="Add them in Settings" />
          ) : (
            <div className="space-y-1.5">
              {data.conversationalCoverage.map((c) => {
                const cov = coverageLabel(c.count, maxCoverage);
                return (
                  <div key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="w-44 truncate">{c.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${Math.min(100, (c.count / maxCoverage) * 100)}%` }}
                      />
                    </div>
                    <span className={`w-20 text-right text-xs font-medium ${cov.cls}`}>{cov.label}</span>
                    <span className="w-10 text-right text-xs text-muted">{c.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Sentences by dialect</h2>
          {data.dialectDistribution.length === 0 ? (
            <EmptyState title="No sentences yet" hint="Import data or add sentences manually" />
          ) : (
            <div className="space-y-1.5">
              {data.dialectDistribution.slice(0, 12).map((d) => (
                <div key={d.name} className="flex items-center gap-3 text-sm">
                  <span className="w-32 truncate">{d.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(d.count / maxDialect) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs text-muted">{d.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Quality & verification</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted mb-2">Sentences</div>
              {(["GOLD", "SILVER", "REFERENCE", "CANDIDATE"] as const).map((q) => (
                <div key={q} className="flex justify-between py-0.5">
                  <Badge value={q} />
                  <span>{(data.qualityDistribution.sentences[q] ?? 0).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-0.5 mt-2 border-t border-border pt-2">
                <Badge value="VERIFIED" />
                <span>{t.verifiedSentences.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-2">Coverage</div>
              <div className="py-0.5 flex justify-between">
                <span>Sentence pronunciation</span>
                <span>{Math.round(data.pronunciationCoverage.sentences * 100)}%</span>
              </div>
              <div className="py-0.5 flex justify-between">
                <span>Expression pronunciation</span>
                <span>{Math.round(data.pronunciationCoverage.expressions * 100)}%</span>
              </div>
              <div className="text-xs text-muted mt-3 mb-1">Languages</div>
              {data.languageDistribution.slice(0, 5).map((l) => (
                <div key={l.name} className="py-0.5 flex justify-between">
                  <span>{l.name}</span>
                  <span>{l.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Recent imports</h2>
          {data.recentImports.length === 0 ? (
            <EmptyState title="No imports yet" hint="Use Media & Sources → Import files" />
          ) : (
            <div className="space-y-2">
              {data.recentImports.map((job) => (
                <Link key={job.id} href={`/sources?job=${job.id}`} className="flex items-center justify-between text-sm hover:bg-foreground/5 rounded-lg px-2 py-1.5 -mx-2">
                  <span className="truncate">{job.source?.name ?? job.filename}</span>
                  <span className="flex items-center gap-2 text-xs text-muted shrink-0">
                    <span className="text-green-600">{job.accepted} new</span>
                    <span>{job.matched} matched</span>
                    {job.conflicts > 0 && <span className="text-amber-600">{job.conflicts} conflicts</span>}
                    {job.errors > 0 && <span className="text-red-600">{job.errors} errors</span>}
                    <Badge value={job.status} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
