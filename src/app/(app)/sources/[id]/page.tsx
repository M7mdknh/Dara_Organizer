"use client";

import { use } from "react";
import Link from "next/link";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState } from "@/components/ui";

interface SourceDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  importJobs: { id: string; status: string; filename: string | null; accepted: number; matched: number; conflicts: number; duplicates: number; errors: number; totalRows: number; createdAt: string }[];
  expressions: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  sentences: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  _count: { expressions: number; sentences: number; conversations: number; concepts: number };
}

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading } = useApi<{ item: SourceDetail }>(`/api/sources/${id}`);
  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Source not found" />;
  const s = data.item;

  return (
    <div>
      <PageHeader title={s.name} subtitle={s.description ?? undefined} actions={<Badge value="TYPE" label={s.type} />} />

      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-muted mb-3">Import history</h3>
        {s.importJobs.length === 0 ? (
          <EmptyState title="No import jobs" hint="Manually created source" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted text-start">
                <th className="p-1.5 text-start">File</th>
                <th className="p-1.5 text-start">Status</th>
                <th className="p-1.5 text-start">Rows</th>
                <th className="p-1.5 text-start">Accepted</th>
                <th className="p-1.5 text-start">Matched</th>
                <th className="p-1.5 text-start">Conflicts</th>
                <th className="p-1.5 text-start">Errors</th>
                <th className="p-1.5 text-start">Date</th>
              </tr>
            </thead>
            <tbody>
              {s.importJobs.map((j) => (
                <tr key={j.id} className="border-t border-border/50">
                  <td className="p-1.5">{j.filename}</td>
                  <td className="p-1.5"><Badge value={j.status} /></td>
                  <td className="p-1.5">{j.totalRows}</td>
                  <td className="p-1.5 text-green-600">{j.accepted}</td>
                  <td className="p-1.5">{j.matched}</td>
                  <td className="p-1.5 text-amber-600">{j.conflicts}</td>
                  <td className="p-1.5 text-red-600">{j.errors}</td>
                  <td className="p-1.5 text-xs text-muted">{new Date(j.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Expressions from this source ({s._count.expressions})</h3>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {s.expressions.map((e) => (
              <Link key={e.id} href={`/words/${e.id}`} className="flex justify-between py-1 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <ArabicText text={e.textOriginal} />
                <span className="text-xs text-muted">{e.dialect?.name}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Sentences from this source ({s._count.sentences})</h3>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {s.sentences.map((sent) => (
              <Link key={sent.id} href={`/sentences/${sent.id}`} className="flex justify-between py-1 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <ArabicText text={sent.textOriginal} />
                <span className="text-xs text-muted">{sent.dialect?.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
