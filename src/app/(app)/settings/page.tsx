"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { useLookups } from "@/components/lookups";
import { PageHeader, Spinner, Input, Field, Button, Select, EmptyState, Badge } from "@/components/ui";
import { DialectManager } from "@/components/DialectManager";
import { CategoryManager } from "@/components/CategoryManager";
import { LanguageManager } from "@/components/LanguageManager";
import { TaxonomyManager } from "@/components/TaxonomyManager";

const TABS = ["Dialects", "Languages", "Categories", "Taxonomies", "AI & Confidence", "Export defaults", "Users"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Dialects");
  const lookups = useLookups();
  const categories = useApi<{ items: { id: string; name: string; parentId: string | null; enabled: boolean; _count?: { sentences: number; expressions: number; conversations: number } }[] }>("/api/categories");

  return (
    <div>
      <PageHeader title="Settings" subtitle="Admin-managed taxonomies, AI configuration, and export defaults" />
      <div className="mb-5 flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Dialects" && lookups && <DialectManager dialects={lookups.dialects} onChanged={() => window.location.reload()} />}
      {tab === "Languages" && lookups && <LanguageManager languages={lookups.languages} onChanged={() => window.location.reload()} />}
      {tab === "Categories" && categories.data && <CategoryManager categories={categories.data.items} onChanged={() => categories.refetch()} />}
      {tab === "Taxonomies" && (
        <div className="grid md:grid-cols-2 gap-4">
          <TaxonomyManager type="topics" label="Topics" />
          <TaxonomyManager type="intents" label="Intents" />
          <TaxonomyManager type="situations" label="Situations" />
          <TaxonomyManager type="registers" label="Registers" />
          <TaxonomyManager type="functions" label="Conversational functions" />
        </div>
      )}
      {tab === "AI & Confidence" && <AiSettings />}
      {tab === "Export defaults" && <ExportSettings />}
      {tab === "Users" && <UsersSettings />}
    </div>
  );
}

interface SettingsResponse {
  settings: Record<string, unknown>;
  aiKeyConfigured: boolean;
  openaiKeyConfigured: boolean;
  semanticMatching: {
    enabled: boolean;
    topK: number;
    minSimilarity: number;
    autoApprove: boolean;
    adjudicationEnabled: boolean;
    embeddingModel: string;
    embeddingDimensions: number;
    reasoningModel: string;
    adjudicationModel: string;
  };
  backgroundJobs: { enabled: boolean; redisConfigured: boolean };
  storage: { provider: string };
}

function AiSettings() {
  const { data, loading, refetch } = useApi<SettingsResponse>("/api/settings");
  const [provider, setProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading || !data) return <Spinner />;
  const current = (data.settings.ai as { provider?: string } | undefined)?.provider ?? "none";
  const value = provider ?? current;
  const sm = data.semanticMatching;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card p-4 space-y-4">
        <h3 className="font-semibold">AI provider</h3>
        <p className="text-sm text-muted">
          AI is a provider-independent assistant around human dialect knowledge. Its output is always marked as
          AI-generated, stored as candidate/Silver data, and routed through review — it never silently overwrites human
          data or fabricates confidence/corpus statistics.
        </p>
        <Field label="Active provider">
          <Select className="w-full" value={value} onChange={(e) => setProvider(e.target.value)}>
            <option value="none">None (enrichment disabled)</option>
            <option value="anthropic">Anthropic{data.aiKeyConfigured ? "" : " (needs ANTHROPIC_API_KEY)"}</option>
            <option value="openai">OpenAI{data.openaiKeyConfigured ? "" : " (needs OPENAI_API_KEY)"} — enables embeddings & semantic matching</option>
            <option value="mock">Mock provider (dev only — clearly labeled, not real output)</option>
          </Select>
        </Field>
        {value === "anthropic" && !data.aiKeyConfigured && (
          <p className="text-sm text-amber-600">Set ANTHROPIC_API_KEY in the server environment to activate this provider.</p>
        )}
        {value === "openai" && !data.openaiKeyConfigured && (
          <p className="text-sm text-amber-600">Set OPENAI_API_KEY in the server environment to activate this provider.</p>
        )}
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api("/api/settings", { method: "PUT", json: { key: "ai", value: { provider: value } } });
              await refetch();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>

        <div className="pt-4 border-t border-border">
          <h4 className="font-medium mb-2">Confidence policy</h4>
          <ul className="text-sm text-muted list-disc ps-5 space-y-1">
            <li>Deterministic exact/normalized matches are applied automatically — no reviewer burden.</li>
            <li>Semantic overlaps, dialect disagreements, and human-vs-AI disagreements always route to Review Inbox.</li>
            <li>AI-generated suggestions are never applied automatically; they appear as review items with provider/model/timestamp provenance.</li>
            <li>LLM self-reported confidence is never treated as a calibrated probability or displayed as fact.</li>
          </ul>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="font-semibold mb-1">Semantic matching pipeline (deployment configuration)</h3>
        <p className="text-xs text-muted mb-2">
          Controlled via environment variables, not editable here — secrets and infrastructure topology are deployment
          concerns. Shown for operator visibility.
        </p>
        <dl className="text-sm grid grid-cols-2 gap-y-1.5">
          <dt className="text-muted">Semantic matching</dt>
          <dd><Badge value={sm.enabled ? "VERIFIED" : "UNVERIFIED"} label={sm.enabled ? "Enabled" : "Disabled"} /></dd>
          <dt className="text-muted">Candidate retrieval (top-K)</dt>
          <dd>{sm.topK}</dd>
          <dt className="text-muted">Min vector similarity</dt>
          <dd>{sm.minSimilarity}</dd>
          <dt className="text-muted">Auto-approve from similarity alone</dt>
          <dd><Badge value={sm.autoApprove ? "REJECTED" : "VERIFIED"} label={sm.autoApprove ? "Enabled (not recommended)" : "Disabled (recommended)"} /></dd>
          <dt className="text-muted">Adjudication escalation</dt>
          <dd><Badge value={sm.adjudicationEnabled ? "VERIFIED" : "UNVERIFIED"} label={sm.adjudicationEnabled ? "Enabled" : "Disabled"} /></dd>
          <dt className="text-muted">Embedding model</dt>
          <dd className="font-mono text-xs">{sm.embeddingModel} ({sm.embeddingDimensions}d)</dd>
          <dt className="text-muted">Reasoning model</dt>
          <dd className="font-mono text-xs">{sm.reasoningModel}</dd>
          <dt className="text-muted">Adjudication model</dt>
          <dd className="font-mono text-xs">{sm.adjudicationModel}</dd>
          <dt className="text-muted">Background jobs</dt>
          <dd><Badge value={data.backgroundJobs.enabled ? "VERIFIED" : "UNVERIFIED"} label={data.backgroundJobs.enabled ? "Enabled" : "Inline fallback"} /></dd>
          <dt className="text-muted">Object storage</dt>
          <dd>{data.storage.provider}</dd>
        </dl>
      </div>

      <EmbeddingMaintenance />
    </div>
  );
}

interface EmbeddingStatus {
  concepts: { total: number; embedded: number; hasMissing: boolean };
  sentences: { total: number; embedded: number; hasMissing: boolean };
  expressions: { total: number; embedded: number };
  staleCount: number;
}

function EmbeddingMaintenance() {
  const { data, loading, refetch } = useApi<EmbeddingStatus>("/api/embeddings/status");
  const [busy, setBusy] = useState<string | null>(null);

  async function backfill(entityType: "CONCEPT" | "SENTENCE", mode: "missing" | "stale") {
    setBusy(`${entityType}-${mode}`);
    try {
      const res = await api<{ requested: number; queued: number; ranInline: number }>("/api/embeddings/backfill", {
        method: "POST",
        json: { entityType, mode, limit: 500 },
      });
      alert(`${res.requested} embedding(s) requested (${res.queued} queued, ${res.ranInline} ran inline).`);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !data) return <Spinner />;

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">Embedding coverage & maintenance</h3>
      <table className="w-full text-sm mb-3">
        <thead>
          <tr className="text-xs text-muted">
            <th className="text-start p-1">Entity</th>
            <th className="text-start p-1">Embedded</th>
            <th className="text-start p-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border/50">
            <td className="p-1">Concepts</td>
            <td className="p-1">{data.concepts.embedded} / {data.concepts.total}</td>
            <td className="p-1">
              <Button variant="secondary" disabled={busy !== null} onClick={() => backfill("CONCEPT", "missing")}>
                {busy === "CONCEPT-missing" ? "Working…" : "Backfill missing"}
              </Button>
            </td>
          </tr>
          <tr className="border-t border-border/50">
            <td className="p-1">Sentences</td>
            <td className="p-1">{data.sentences.embedded} / {data.sentences.total}</td>
            <td className="p-1">
              <Button variant="secondary" disabled={busy !== null} onClick={() => backfill("SENTENCE", "missing")}>
                {busy === "SENTENCE-missing" ? "Working…" : "Backfill missing"}
              </Button>
            </td>
          </tr>
          <tr className="border-t border-border/50">
            <td className="p-1">Expressions</td>
            <td className="p-1">{data.expressions.embedded} / {data.expressions.total}</td>
            <td className="p-1 text-xs text-muted">Not embedded by default</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted">
        {data.staleCount} embedding(s) currently marked stale (source text changed since last embedded, or no provider
        was configured when they were queued).
      </p>
    </div>
  );
}

function ExportSettings() {
  const { data, loading, refetch } = useApi<{ settings: Record<string, unknown> }>("/api/settings");
  const [schema, setSchema] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (loading || !data) return <Spinner />;
  const current = (data.settings.export as { defaultSchema?: string } | undefined)?.defaultSchema ?? "standard";
  const value = schema ?? current;
  return (
    <div className="card p-4 max-w-xl space-y-4">
      <h3 className="font-semibold">Export defaults</h3>
      <Field label="Default export schema">
        <Select className="w-full" value={value} onChange={(e) => setSchema(e.target.value)}>
          <option value="standard">Standard (full provenance & quality fields)</option>
          <option value="lean">Lean (training-only fields)</option>
        </Select>
      </Field>
      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await api("/api/settings", { method: "PUT", json: { key: "export", value: { defaultSchema: value } } });
            await refetch();
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function UsersSettings() {
  const { data, loading, refetch } = useApi<{ items: { id: string; email: string; name: string; role: string; active: boolean }[] }>("/api/users");
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "VIEWER" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <Spinner />;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-4">
        <h3 className="font-semibold mb-3">Users</h3>
        {!data?.items.length ? (
          <EmptyState title="No users" />
        ) : (
          <div className="space-y-1">
            {data.items.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-border/50 text-sm">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={u.role}
                    onChange={async (e) => {
                      await api(`/api/users/${u.id}`, { method: "PATCH", json: { role: e.target.value } });
                      refetch();
                    }}
                  >
                    {["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Badge value={u.active ? "VERIFIED" : "REJECTED"} label={u.active ? "Active" : "Disabled"} />
                  <button
                    className="text-xs text-muted hover:underline"
                    onClick={async () => {
                      await api(`/api/users/${u.id}`, { method: "PATCH", json: { active: !u.active } });
                      refetch();
                    }}
                  >
                    {u.active ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card p-4">
        <h3 className="font-semibold mb-3">Add user</h3>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError(null);
            try {
              await api("/api/users", { method: "POST", json: form });
              setForm({ email: "", name: "", password: "", role: "VIEWER" });
              refetch();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </Field>
          <Field label="Password">
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
          </Field>
          <Field label="Role">
            <Select className="w-full" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {["ADMIN", "EDITOR", "REVIEWER", "VIEWER"].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
        </form>
      </div>
    </div>
  );
}
