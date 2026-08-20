"use client";

import { use, useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups } from "@/components/lookups";
import { PageHeader, Spinner, Badge, ArabicText, EmptyState, Input, Button, Select, Field, confirmDanger } from "@/components/ui";

interface PatternDetail {
  id: string;
  name: string;
  description: string | null;
  intent: { id: string; name: string } | null;
  triggers: { id: string; textOriginal: string; dialect: { name: string } | null }[];
  variants: {
    id: string;
    textOriginal: string;
    weight: number;
    commonness: string;
    quality: string;
    verification: string;
    status: string;
    notes: string | null;
    dialect: { name: string } | null;
  }[];
}

export default function ResponsePatternPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, refetch } = useApi<{ item: PatternDetail }>(`/api/response-patterns/${id}`);
  const lookups = useLookups();
  const [newTrigger, setNewTrigger] = useState("");
  const [newVariant, setNewVariant] = useState("");
  const [newVariantWeight, setNewVariantWeight] = useState("10");

  if (loading || !lookups) return <Spinner />;
  if (!data?.item) return <EmptyState title="Response pattern not found" />;
  const p = data.item;
  const totalWeight = p.variants.filter((v) => v.status === "ACTIVE").reduce((s, v) => s + v.weight, 0);

  async function patch(body: Record<string, unknown>) {
    await api(`/api/response-patterns/${id}`, { method: "PATCH", json: body });
    refetch();
  }

  return (
    <div>
      <PageHeader
        title={p.name}
        subtitle={p.description ?? undefined}
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirmDanger("Delete this response pattern and all its triggers/variants?")) return;
              await api(`/api/response-patterns/${id}`, { method: "DELETE" });
              window.location.href = "/responses";
            }}
          >
            Delete
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-muted mb-3">Triggers</h3>
          <div className="space-y-1.5 mb-3">
            {p.triggers.length === 0 && <p className="text-sm text-muted">No triggers yet</p>}
            {p.triggers.map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-1.5">
                <ArabicText text={t.textOriginal} className="text-base" />
                <div className="flex items-center gap-2">
                  {t.dialect && <span className="text-xs text-muted">{t.dialect.name}</span>}
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => patch({ removeTriggerId: t.id })}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTrigger.trim()) return;
              patch({ addTrigger: { textOriginal: newTrigger.trim() } });
              setNewTrigger("");
            }}
          >
            <Input dir="auto" placeholder="Add a trigger variant…" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted">Response variants</h3>
            <span className="text-xs text-muted">Total weight: {totalWeight}</span>
          </div>
          <div className="space-y-2 mb-3">
            {p.variants.length === 0 && <p className="text-sm text-muted">No response variants yet</p>}
            {p.variants.map((v) => (
              <div key={v.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <ArabicText text={v.textOriginal} className="text-base font-medium" />
                  <div className="flex items-center gap-1.5">
                    <Badge value={v.quality} />
                    <Badge value={v.verification} />
                    {v.status === "REJECTED" && <Badge value="REJECTED" />}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    Weight
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      defaultValue={v.weight}
                      className="w-16 rounded border border-border bg-background px-1.5 py-0.5"
                      onBlur={(e) => {
                        const weight = Number(e.target.value);
                        if (weight !== v.weight) patch({ updateVariant: { id: v.id, weight } });
                      }}
                    />
                  </label>
                  <span className="text-muted">
                    {totalWeight > 0 ? `${Math.round((v.weight / totalWeight) * 100)}% selection share` : ""}
                  </span>
                  {v.verification !== "VERIFIED" && (
                    <button className="text-accent hover:underline" onClick={() => patch({ updateVariant: { id: v.id, verification: "VERIFIED" } })}>
                      Verify
                    </button>
                  )}
                  <button className="text-red-600 hover:underline ms-auto" onClick={() => patch({ removeVariantId: v.id })}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newVariant.trim()) return;
              patch({ addVariant: { textOriginal: newVariant.trim(), weight: Number(newVariantWeight) || 10 } });
              setNewVariant("");
            }}
          >
            <Input dir="auto" placeholder="Add a response variant…" value={newVariant} onChange={(e) => setNewVariant(e.target.value)} />
            <Input type="number" className="w-20" value={newVariantWeight} onChange={(e) => setNewVariantWeight(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
        </div>
      </div>

      <div className="card p-4 mt-4 max-w-md">
        <Field label="Intent">
          <Select className="w-full" value={p.intent?.id ?? ""} onChange={(e) => patch({ intentId: e.target.value || null })}>
            <option value="">None</option>
            {lookups.intents.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  );
}
