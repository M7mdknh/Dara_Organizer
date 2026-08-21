"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi, useDebounced } from "@/lib/client";
import { useLookups } from "@/components/lookups";
import { PageHeader, Spinner, ArabicText, EmptyState, Input, Pagination } from "@/components/ui";

interface ConceptRow {
  id: string;
  key: string;
  gloss: string;
  canonicalMsa: string | null;
  expressions: {
    expression: {
      id: string;
      textOriginal: string;
      dialect: { id: string; name: string } | null;
      language: { id: string; code: string; name: string };
    };
  }[];
  _count: { sentences: number };
}

type ColumnKind = "dialect" | "language";
interface ColumnDef {
  id: string; // dialectId or languageId
  kind: ColumnKind;
  label: string;
}

/**
 * Meaning-centered view of the whole knowledge system (CLAUDE.md: concepts
 * are semantic anchors, not spreadsheet rows). Each row is a Concept; the
 * user picks which dialects/languages appear as columns, showing how that
 * meaning is realized across all of them at a glance. Clicking a row opens
 * the full concept detail page (edit gloss/MSA, add forms, see sentences).
 */
export function MeaningsView() {
  const lookups = useLookups();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState<Set<string> | null>(null); // null = not yet initialized from lookups

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (dq) p.set("q", dq);
    return p.toString();
  }, [dq, page]);

  const { data, loading } = useApi<{ items: ConceptRow[]; total: number }>(`/api/concepts?${query}`);

  const allColumns: ColumnDef[] = useMemo(() => {
    if (!lookups) return [];
    const dialectCols: ColumnDef[] = lookups.dialects
      .filter((d) => d.enabled)
      .map((d) => ({ id: d.id, kind: "dialect" as const, label: d.name }));
    const languageCols: ColumnDef[] = lookups.languages
      .filter((l) => l.enabled && l.code !== "ar")
      .map((l) => ({ id: l.id, kind: "language" as const, label: l.name }));
    return [...dialectCols, ...languageCols];
  }, [lookups]);

  // Sensible default selection on first load: MSA + up to 2 most-used
  // dialects present in the current page of results + English, so the
  // table isn't overwhelming before the user customizes it.
  const activeColumns = useMemo(() => {
    if (columns) return allColumns.filter((c) => columns.has(c.id));
    if (!lookups || !data) return [];
    const msa = allColumns.find((c) => c.kind === "dialect" && c.label === "MSA");
    const english = allColumns.find((c) => c.kind === "language" && c.label === "English");
    const dialectCounts = new Map<string, number>();
    for (const row of data.items) {
      for (const e of row.expressions) {
        if (e.expression.dialect) dialectCounts.set(e.expression.dialect.id, (dialectCounts.get(e.expression.dialect.id) ?? 0) + 1);
      }
    }
    const topDialects = allColumns
      .filter((c) => c.kind === "dialect" && c.label !== "MSA")
      .sort((a, b) => (dialectCounts.get(b.id) ?? 0) - (dialectCounts.get(a.id) ?? 0))
      .slice(0, 2);
    return [msa, ...topDialects, english].filter((c): c is ColumnDef => !!c);
  }, [columns, allColumns, lookups, data]);

  function toggleColumn(id: string) {
    setColumns((prev) => {
      const base = prev ?? new Set(activeColumns.map((c) => c.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cellFor(row: ConceptRow, col: ColumnDef): { id: string; text: string } | null {
    const match = row.expressions.find((e) =>
      col.kind === "dialect" ? e.expression.dialect?.id === col.id : e.expression.language.id === col.id && !e.expression.dialect,
    );
    return match ? { id: match.expression.id, text: match.expression.textOriginal } : null;
  }

  return (
    <div>
      <PageHeader title="Meanings" subtitle="Every concept, and how it's said across dialects and languages" />

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search meanings, words, or sentences…" className="max-w-sm" dir="auto" />
      </div>

      {lookups && allColumns.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-xs">
          <span className="text-muted">Show:</span>
          {allColumns.map((c) => (
            <label key={c.id} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={activeColumns.some((a) => a.id === c.id)} onChange={() => toggleColumn(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No meanings yet" hint="Upload data to start building the concept graph" />
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground/5">
                <th className="text-start p-2 whitespace-nowrap">Meaning</th>
                {activeColumns.map((c) => (
                  <th key={c.id} className="text-start p-2 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="text-start p-2 whitespace-nowrap">Sentences</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-t border-border/50 hover:bg-foreground/5">
                  <td className="p-2 whitespace-nowrap">
                    <Link href={`/words/concepts/${row.id}`} className="font-medium hover:text-accent">
                      {row.gloss}
                    </Link>
                    <div className="text-xs text-muted font-mono">{row.key}</div>
                  </td>
                  {activeColumns.map((c) => {
                    const cell = cellFor(row, c);
                    return (
                      <td key={c.id} className="p-2 max-w-40 truncate">
                        {cell ? <ArabicText text={cell.text} /> : <span className="text-muted/50">—</span>}
                      </td>
                    );
                  })}
                  <td className="p-2 text-xs text-muted">{row._count.sentences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />}
    </div>
  );
}
