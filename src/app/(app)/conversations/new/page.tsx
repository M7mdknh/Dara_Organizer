"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ConversationEditor, emptyConversation } from "@/components/ConversationEditor";

export default function NewConversationPage() {
  const router = useRouter();
  return (
    <div>
      <PageHeader title="New conversation" subtitle="Build a natural multi-turn dialogue" />
      <ConversationEditor initial={emptyConversation()} onSaved={(id) => router.push(`/conversations/${id}`)} />
    </div>
  );
}
