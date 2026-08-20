"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, ArabicText, EmptyState, Input, Button, Field, Modal, confirmDanger } from "@/components/ui";
import { CreateSentenceModal } from "@/components/CreateSentenceModal";

interface GroupDetail {
  id: string;
  name: string;
  meaning: string | null;
  intent: { name: string } | null;
  sentences: { id: string; textOriginal: string; meaning: string | null; dialect: { name: string } | null; language: { name: string } }[];
}

export default function UtteranceGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: GroupDetail }>(`/api/utterance-groups/${id}`);
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  if (loading) return <Spinner />;
  if (!data?.item) return <EmptyState title="Utterance group not found" />;
  const g = data.item;

  return (
    <div>
      <PageHeader
        title={g.name}
        subtitle={g.meaning ?? "Equivalent utterance group"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button onClick={() => setShowAdd(true)}>+ Add equivalent sentence</Button>
          </>
        }
      />
      <div className="card p-4">
        <p className="text-xs text-muted mb-3">
          These sentences express the same communicative meaning across dialects and languages. They are natural, equivalent realizations — not word-for-word translations.
        </p>
        {g.sentences.length === 0 ? (
          <EmptyState title="No sentences yet" />
        ) : (
          <div className="space-y-2">
            {g.sentences.map((s) => (
              <Link key={s.id} href={`/sentences/${s.id}`} className="flex items-center justify-between py-2 px-3 hover:bg-foreground/5 rounded-lg border border-border/60">
                <div>
                  <ArabicText text={s.textOriginal} className="text-lg block" />
                  {s.meaning && <span className="text-xs text-muted">{s.meaning}</span>}
                </div>
                <span className="text-xs font-medium text-muted shrink-0">{s.dialect?.name ?? s.language.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <Modal title="Edit utterance group" onClose={() => setEditing(false)}>
          <EditGroupForm group={g} onSaved={() => { setEditing(false); refetch(); }} />
        </Modal>
      )}
      {showAdd && (
        <CreateSentenceModal defaultUtteranceGroupId={id} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); refetch(); }} />
      )}
    </div>
  );
}

function EditGroupForm({ group, onSaved }: { group: GroupDetail; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [meaning, setMeaning] = useState(group.meaning ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api(`/api/utterance-groups/${group.id}`, { method: "PATCH", json: { name, meaning: meaning || null } });
          onSaved();
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Meaning">
        <Input value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      </Field>
      <div className="flex justify-between">
        <Button
          type="button"
          variant="danger"
          onClick={async () => {
            if (!confirmDanger("Delete this utterance group? Sentences will remain but be detached.")) return;
            await api(`/api/utterance-groups/${group.id}`, { method: "DELETE" });
            window.location.href = "/sentences";
          }}
        >
          Delete group
        </Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
