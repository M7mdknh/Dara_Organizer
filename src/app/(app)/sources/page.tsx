"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, EmptyState, Button } from "@/components/ui";
import { ImportWizard } from "@/components/ImportWizard";

interface SourceRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  importJobs: { id: string; status: string; accepted: number; matched: number; conflicts: number; errors: number }[];
  _count: { expressions: number; sentences: number; conversations: number; concepts: number };
}

function SourcesContent() {
  const jobParam = useSearchParams().get("job");
  const { data, loading, refetch } = useApi<{ items: SourceRow[] }>("/api/sources");
  const [showImport, setShowImport] = useState(Boolean(jobParam) === false);

  return (
    <div>
      <PageHeader title="Media & Sources" subtitle="Every import becomes a traceable source" actions={<Button onClick={() => setShowImport(true)}>+ Import files</Button>} />
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No sources yet" hint="Import XLSX, CSV, TXT, or paste text to get started" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                <th className="p-2 text-start">Source</th>
                <th className="p-2 text-start">Type</th>
                <th className="p-2 text-start">Records</th>
                <th className="p-2 text-start">Last import</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-foreground/5">
                  <td className="p-2">
                    <Link href={`/sources/${s.id}`} className="hover:text-accent font-medium">{s.name}</Link>
                  </td>
                  <td className="p-2"><Badge value="TYPE" label={s.type} /></td>
                  <td className="p-2 text-xs text-muted">
                    {s._count.expressions} expr · {s._count.sentences} sent · {s._count.conversations} conv
                  </td>
                  <td className="p-2 text-xs">
                    {s.importJobs[0] ? (
                      <span className="flex gap-2 items-center">
                        <Badge value={s.importJobs[0].status} />
                        <span className="text-green-600">{s.importJobs[0].accepted} new</span>
                        <span className="text-muted">{s.importJobs[0].matched} matched</span>
                        {s.importJobs[0].conflicts > 0 && <span className="text-amber-600">{s.importJobs[0].conflicts} conflicts</span>}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); void refetch(); }} />}
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SourcesContent />
    </Suspense>
  );
}
