"use client";

import { use } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, ArabicText, EmptyState, Button, confirmDanger } from "@/components/ui";

interface CollectionDetail {
  item: { id: string; name: string; description: string | null };
  entities: {
    sentences: { id: string; textOriginal: string; dialect: { name: string } | null }[];
    expressions: { id: string; textOriginal: string; dialect: { name: string } | null }[];
    conversations: { id: string; title: string }[];
    concepts: { id: string; key: string; gloss: string }[];
  };
}

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<CollectionDetail>(`/api/collections/${id}`);
  if (loading) return <Spinner />;
  if (!data) return <EmptyState title="Collection not found" />;

  async function removeItem(entityType: string, entityId: string) {
    await api(`/api/collections/${id}`, { method: "PATCH", json: { remove: [{ entityType, entityId }] } });
    refetch();
  }

  const empty =
    data.entities.sentences.length === 0 &&
    data.entities.expressions.length === 0 &&
    data.entities.conversations.length === 0 &&
    data.entities.concepts.length === 0;

  return (
    <div>
      <PageHeader
        title={data.item.name}
        subtitle={data.item.description ?? undefined}
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirmDanger("Delete this collection? Items stay in the corpus, only the grouping is removed.")) return;
              await api(`/api/collections/${id}`, { method: "DELETE" });
              window.location.href = "/collections";
            }}
          >
            Delete collection
          </Button>
        }
      />
      {empty ? (
        <EmptyState title="No records yet" hint="Add records from Sentences, Words, or Conversations using bulk actions" />
      ) : (
        <div className="space-y-4">
          {data.entities.sentences.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">Sentences</h3>
              {data.entities.sentences.map((s) => (
                <div key={s.id} className="flex justify-between items-center py-1.5 text-sm">
                  <Link href={`/sentences/${s.id}`} className="hover:text-accent"><ArabicText text={s.textOriginal} /></Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{s.dialect?.name}</span>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeItem("sentence", s.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.entities.expressions.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">Expressions</h3>
              {data.entities.expressions.map((e) => (
                <div key={e.id} className="flex justify-between items-center py-1.5 text-sm">
                  <Link href={`/words/${e.id}`} className="hover:text-accent"><ArabicText text={e.textOriginal} /></Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{e.dialect?.name}</span>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeItem("expression", e.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.entities.conversations.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-muted mb-2">Conversations</h3>
              {data.entities.conversations.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-1.5 text-sm">
                  <Link href={`/conversations/${c.id}`} className="hover:text-accent">{c.title}</Link>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => removeItem("conversation", c.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
