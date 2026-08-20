"use client";

import Link from "next/link";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { sentences: number; expressions: number; conversations: number };
}

function tree(items: CategoryItem[], parentId: string | null): CategoryItem[] {
  return items.filter((c) => (c.parentId ?? null) === parentId);
}

export default function CategoriesPage() {
  const { data, loading } = useApi<{ items: CategoryItem[] }>("/api/categories");
  if (loading) return <Spinner />;
  if (!data?.items.length) {
    return (
      <div>
        <PageHeader title="Categories" subtitle="Hierarchical topic organization for sentences, expressions, and conversations" />
        <EmptyState title="No categories yet" hint="Add them in Settings → Categories" />
      </div>
    );
  }

  function Node({ c, depth }: { c: CategoryItem; depth: number }) {
    const children = tree(data!.items, c.id);
    const total = c._count.sentences + c._count.expressions + c._count.conversations;
    return (
      <>
        <Link
          href={`/sentences?categoryId=${c.id}`}
          className="flex items-center justify-between py-2 px-2 hover:bg-foreground/5 rounded text-sm"
          style={{ paddingInlineStart: depth * 20 + 8 }}
        >
          <span>{c.name}</span>
          <span className="text-xs text-muted">{total} records</span>
        </Link>
        {children.map((cc) => <Node key={cc.id} c={cc} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Categories" subtitle="Hierarchical topic organization for sentences, expressions, and conversations" />
      <div className="card p-2">{tree(data.items, null).map((c) => <Node key={c.id} c={c} depth={0} />)}</div>
    </div>
  );
}
