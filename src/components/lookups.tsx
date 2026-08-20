"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export interface DialectNode {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  parentId: string | null;
  enabled: boolean;
  sortOrder: number;
}
export interface Language {
  id: string;
  code: string;
  name: string;
  direction: string;
  enabled: boolean;
}
export interface TaxonomyItem {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  enabled: boolean;
  parentId?: string | null;
}

export interface Lookups {
  dialects: DialectNode[];
  languages: Language[];
  categories: TaxonomyItem[];
  topics: TaxonomyItem[];
  intents: TaxonomyItem[];
  situations: TaxonomyItem[];
  registers: TaxonomyItem[];
  functions: TaxonomyItem[];
}

let cache: Lookups | null = null;
let inflight: Promise<Lookups> | null = null;

async function loadLookups(): Promise<Lookups> {
  const [dialects, languages, categories, topics, intents, situations, registers, functions] =
    await Promise.all([
      api<{ items: DialectNode[] }>("/api/dialects"),
      api<{ items: Language[] }>("/api/languages"),
      api<{ items: TaxonomyItem[] }>("/api/categories"),
      api<{ items: TaxonomyItem[] }>("/api/taxonomies/topics"),
      api<{ items: TaxonomyItem[] }>("/api/taxonomies/intents"),
      api<{ items: TaxonomyItem[] }>("/api/taxonomies/situations"),
      api<{ items: TaxonomyItem[] }>("/api/taxonomies/registers"),
      api<{ items: TaxonomyItem[] }>("/api/taxonomies/functions"),
    ]);
  return {
    dialects: dialects.items,
    languages: languages.items,
    categories: categories.items,
    topics: topics.items,
    intents: intents.items,
    situations: situations.items,
    registers: registers.items,
    functions: functions.items,
  };
}

export function invalidateLookups() {
  cache = null;
  inflight = null;
}

export function useLookups(): Lookups | null {
  const [lookups, setLookups] = useState<Lookups | null>(cache);
  useEffect(() => {
    if (cache) return;
    if (!inflight) inflight = loadLookups().then((l) => (cache = l));
    void inflight.then(setLookups).catch(() => setLookups(null));
  }, []);
  return lookups;
}

/** Indented dialect options preserving tree structure. */
export function dialectOptions(dialects: DialectNode[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, DialectNode[]>();
  for (const d of dialects) {
    const key = d.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(d);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const d of byParent.get(parentId) ?? []) {
      out.push({ id: d.id, label: `${"  ".repeat(depth)}${d.name}${d.nameAr ? ` · ${d.nameAr}` : ""}` });
      walk(d.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function categoryOptions(categories: TaxonomyItem[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, TaxonomyItem[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ id: c.id, label: `${"  ".repeat(depth)}${c.name}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
