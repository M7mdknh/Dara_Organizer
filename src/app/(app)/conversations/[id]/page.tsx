"use client";

import { use } from "react";
import { useApi } from "@/lib/client";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";
import { ConversationEditor, type ConversationFormState } from "@/components/ConversationEditor";
import { RevisionHistory } from "@/components/RevisionHistory";

interface ConversationDetail {
  id: string;
  title: string;
  description: string | null;
  quality: string;
  dialect: { id: string } | null;
  situation: { id: string } | null;
  categories: { category: { id: string } }[];
  turns: { id: string; speaker: string; textOriginal: string; dialect: { id: string } | null; intent: { id: string } | null; function: { id: string } | null; notes: string | null }[];
}

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: ConversationDetail }>(`/api/conversations/${id}`);

  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Conversation not found" />;
  const c = data.item;

  const initial: ConversationFormState = {
    title: c.title,
    description: c.description ?? "",
    dialectId: c.dialect?.id ?? "",
    situationId: c.situation?.id ?? "",
    quality: c.quality,
    categoryIds: c.categories.map((cc) => cc.category.id),
    turns: c.turns.map((t) => ({
      id: t.id,
      speaker: t.speaker,
      textOriginal: t.textOriginal,
      dialectId: t.dialect?.id ?? "",
      intentId: t.intent?.id ?? "",
      functionId: t.function?.id ?? "",
      notes: t.notes ?? "",
    })),
  };

  return (
    <div>
      <PageHeader title={c.title} subtitle="Multi-turn conversation" />
      <ConversationEditor initial={initial} conversationId={id} onSaved={refetch} />
      <div className="card p-4 mt-4">
        <h3 className="text-sm font-semibold text-muted mb-3">History</h3>
        <RevisionHistory entityType="conversation" entityId={id} />
      </div>
    </div>
  );
}
