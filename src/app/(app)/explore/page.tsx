"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button } from "@/components/ui";

interface SearchResults {
  results: null | {
    query: string;
    expressions: {
      id: string;
      textOriginal: string;
      meaningNote: string | null;
      quality: string;
      origin: string;
      dialect: { name: string } | null;
      language: { name: string };
      concepts: { concept: { id: string; key: string; gloss: string } }[];
    }[];
    concepts: { id: string; key: string; gloss: string }[];
    sentences: {
      id: string;
      textOriginal: string;
      meaning: string | null;
      quality: string;
      dialect: { name: string } | null;
      language: { name: string };
    }[];
    conversations: {
      id: string;
      textOriginal: string;
      conversation: { id: string; title: string; dialect: { name: string } | null };
    }[];
    responseVariants: {
      id: string;
      textOriginal: string;
      weight: number;
      pattern: { id: string; name: string };
      dialect: { name: string } | null;
    }[];
    triggers: {
      id: string;
      textOriginal: string;
      pattern: { id: string; name: string; variants: { id: string; textOriginal: string; weight: number }[] };
    }[];
    sources: { id: string; name: string; type: string }[];
    related: {
      concept: { id: string; key: string };
      expression: { id: string; textOriginal: string; dialect: { name: string } | null; language: { name: string } };
    }[];
  };
}

function Section({ title, children, count }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-muted mb-2">
        {title} <span className="font-normal">({count})</span>
      </h2>
      {children}
    </div>
  );
}

function ExploreContent() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const { data, loading } = useApi<SearchResults>(q ? `/api/search?q=${encodeURIComponent(q)}` : null);

  return (
    <div>
      <PageHeader title="Explore" subtitle="Universal search across the whole knowledge system" />
      <form
        className="flex gap-2 mb-5 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} dir="auto" placeholder="Search الحين, دحين, greetings, now…" />
        <Button type="submit">Search</Button>
      </form>

      {!q && <EmptyState title="Search the corpus" hint="Results connect concepts, expressions, sentences, conversations, responses, pronunciation, and sources" />}
      {q && loading && <Spinner />}
      {q && !loading && data?.results && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Concepts & meanings" count={data.results.concepts.length}>
            {data.results.concepts.map((c) => (
              <Link key={c.id} href={`/words/concepts/${c.id}`} className="block py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <span className="font-mono text-xs bg-foreground/10 rounded px-1.5 py-0.5 me-2">{c.key}</span>
                {c.gloss}
              </Link>
            ))}
          </Section>

          <Section title="Words & expressions" count={data.results.expressions.length}>
            {data.results.expressions.map((e) => (
              <Link key={e.id} href={`/words/${e.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <span>
                  <ArabicText text={e.textOriginal} className="font-medium text-base" />
                  {e.meaningNote && <span className="text-muted ms-2 text-xs">{e.meaningNote}</span>}
                </span>
                <span className="flex gap-1.5 shrink-0">
                  {e.dialect && <Badge value="DIALECT" label={e.dialect.name} />}
                  <Badge value={e.quality} />
                  <Badge value={e.origin} />
                </span>
              </Link>
            ))}
          </Section>

          <Section title="Dialect equivalents & related expressions" count={data.results.related.length}>
            {data.results.related.map((r, i) => (
              <Link key={i} href={`/words/${r.expression.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <span>
                  <ArabicText text={r.expression.textOriginal} className="font-medium" />
                  <span className="text-xs text-muted ms-2">{r.expression.dialect?.name ?? r.expression.language.name}</span>
                </span>
                <span className="font-mono text-[10px] text-muted">{r.concept.key}</span>
              </Link>
            ))}
          </Section>

          <Section title="Sentences" count={data.results.sentences.length}>
            {data.results.sentences.map((s) => (
              <Link key={s.id} href={`/sentences/${s.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm gap-3">
                <span className="min-w-0">
                  <ArabicText text={s.textOriginal} className="block truncate" />
                  {s.meaning && <span className="text-xs text-muted block truncate">{s.meaning}</span>}
                </span>
                <span className="flex gap-1.5 shrink-0">
                  {s.dialect && <Badge value="DIALECT" label={s.dialect.name} />}
                  <Badge value={s.quality} />
                </span>
              </Link>
            ))}
          </Section>

          <Section title="Responses" count={data.results.triggers.length + data.results.responseVariants.length}>
            {data.results.triggers.map((t) => (
              <Link key={t.id} href={`/responses/${t.pattern.id}`} className="block py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Trigger:</span>
                  <ArabicText text={t.textOriginal} className="font-medium" />
                </div>
                <div className="text-xs text-muted ms-4 mt-0.5">
                  {t.pattern.variants.slice(0, 3).map((v) => (
                    <ArabicText key={v.id} text={`${v.textOriginal} (${v.weight})`} className="me-3" />
                  ))}
                </div>
              </Link>
            ))}
            {data.results.responseVariants.map((v) => (
              <Link key={v.id} href={`/responses/${v.pattern.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <ArabicText text={v.textOriginal} />
                <span className="text-xs text-muted">{v.pattern.name} · weight {v.weight}</span>
              </Link>
            ))}
          </Section>

          <Section title="Conversations" count={data.results.conversations.length}>
            {data.results.conversations.map((t) => (
              <Link key={t.id} href={`/conversations/${t.conversation.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm gap-3">
                <ArabicText text={t.textOriginal} className="truncate" />
                <span className="text-xs text-muted shrink-0">
                  {t.conversation.title}
                  {t.conversation.dialect ? ` · ${t.conversation.dialect.name}` : ""}
                </span>
              </Link>
            ))}
          </Section>

          <Section title="Sources" count={data.results.sources.length}>
            {data.results.sources.map((s) => (
              <Link key={s.id} href={`/sources/${s.id}`} className="flex items-center justify-between py-1.5 hover:bg-foreground/5 rounded px-2 -mx-2 text-sm">
                <span>{s.name}</span>
                <Badge value={s.type} />
              </Link>
            ))}
          </Section>

          {Object.values(data.results).every((v) => !Array.isArray(v) || v.length === 0) && (
            <div className="lg:col-span-2">
              <EmptyState title={`No results for "${q}"`} hint="Search matches original and normalized Arabic, meanings, and translations" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ExploreContent />
    </Suspense>
  );
}
