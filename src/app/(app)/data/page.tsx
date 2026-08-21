"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { MeaningsView } from "@/components/MeaningsView";
import ExplorePage from "@/app/(app)/explore/page";
import WordsPage from "@/app/(app)/words/page";
import SentencesPage from "@/app/(app)/sentences/page";
import ConversationsPage from "@/app/(app)/conversations/page";
import ResponsesPage from "@/app/(app)/responses/page";

const TABS = [
  { key: "meanings", label: "Meanings" },
  { key: "sentences", label: "Sentences" },
  { key: "conversations", label: "Conversations" },
  { key: "responses", label: "Responses" },
  { key: "words", label: "Words & Expressions" },
  { key: "all", label: "Search all" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function DataContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "meanings") as TabKey;

  function setTab(next: TabKey) {
    router.push(next === "meanings" ? "/data" : `/data?tab=${next}`);
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "meanings" && <MeaningsView />}
      {tab === "all" && <ExplorePage />}
      {tab === "words" && <WordsPage />}
      {tab === "sentences" && <SentencesPage />}
      {tab === "conversations" && <ConversationsPage />}
      {tab === "responses" && <ResponsesPage />}
    </div>
  );
}

export default function DataPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DataContent />
    </Suspense>
  );
}
