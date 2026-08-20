"use client";

import { useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/client";
import { PageHeader, Spinner, EmptyState, Input, Button, Field, Modal } from "@/components/ui";

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  _count: { items: number };
}

export default function CollectionsPage() {
  const { data, loading, refetch } = useApi<{ items: CollectionRow[] }>("/api/collections");
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle="Reusable groupings — e.g. Najdi Core, Hospitality, Voice Agent Responses"
        actions={<Button onClick={() => setShowCreate(true)}>+ New collection</Button>}
      />
      {loading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState title="No collections yet" />
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          {data.items.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="card p-4 hover:border-accent transition-colors">
              <h3 className="font-medium mb-1">{c.name}</h3>
              {c.description && <p className="text-xs text-muted mb-2">{c.description}</p>}
              <div className="text-xs text-muted">{c._count.items} records</div>
            </Link>
          ))}
        </div>
      )}
      {showCreate && (
        <Modal title="New collection" onClose={() => setShowCreate(false)}>
          <CreateCollectionForm onSaved={() => { setShowCreate(false); void refetch(); }} />
        </Modal>
      )}
    </div>
  );
}

function CreateCollectionForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api("/api/collections", { method: "POST", json: { name, description: description || null } });
          onSaved();
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Najdi Core" />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create"}</Button>
      </div>
    </form>
  );
}
