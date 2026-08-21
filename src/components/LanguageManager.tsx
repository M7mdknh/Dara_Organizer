"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { invalidateLookups, type Language } from "@/components/lookups";
import { Button, Input, Field, EmptyState, Select, Badge } from "@/components/ui";
import { findInCatalog, type LanguageCatalogEntry } from "@/domains/languages/catalog";

export function LanguageManager({ languages, onChanged }: { languages: Language[]; onChanged: () => void }) {
  const [enriching, setEnriching] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LanguageCatalogEntry | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nativeName, setNativeName] = useState("");
  const [script, setScript] = useState("Latin");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");

  const existingCodes = new Set(languages.map((l) => l.code));
  const suggestions = query.trim() ? findInCatalog(query).filter((c) => !existingCodes.has(c.code)).slice(0, 6) : [];

  async function refresh() {
    invalidateLookups();
    onChanged();
  }

  function pick(entry: LanguageCatalogEntry) {
    setPicked(entry);
    setCode(entry.code);
    setName(entry.name);
    setNativeName(entry.nativeName);
    setScript(entry.script);
    setDirection(entry.direction);
    setQuery(entry.name);
  }

  async function create() {
    if (!code.trim() || !name.trim()) return;
    await api("/api/languages", {
      method: "POST",
      json: { code: code.trim(), name: name.trim(), nativeName: nativeName.trim() || null, script, direction },
    });
    setQuery("");
    setPicked(null);
    setCode("");
    setName("");
    setNativeName("");
    setScript("Latin");
    setDirection("ltr");
    setAdvanced(false);
    await refresh();
  }

  async function toggle(l: Language) {
    await api(`/api/languages/${l.id}`, { method: "PATCH", json: { enabled: !l.enabled } });
    await refresh();
  }

  async function toggleEnrichment(l: Language) {
    await api(`/api/languages/${l.id}`, { method: "PATCH", json: { aiEnrichmentEnabled: !l.aiEnrichmentEnabled } });
    await refresh();
  }

  async function enrichExisting(l: Language) {
    setEnriching(l.id);
    try {
      const res = await api<{ queued: boolean; result?: { requested: number; created: number; skipped: number } }>(
        `/api/languages/${l.id}/enrich`,
        { method: "POST", json: { onlyVerified: false } },
      );
      if (res.queued) {
        alert(`Enrichment queued — ${l.name} translations for existing meanings will be added in the background.`);
      } else if (res.result) {
        alert(`${l.name}: ${res.result.created} translation(s) added, ${res.result.requested} concepts considered.`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(null);
    }
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3">Languages</h3>
      {languages.length === 0 ? (
        <EmptyState title="No languages configured" />
      ) : (
        <div className="mb-4">
          {languages.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-1.5 border-b border-border/50">
              <span className="w-16 font-mono text-xs">{l.code}</span>
              <span className="flex-1 text-sm">
                {l.name} {l.nativeName && <span className="text-muted">· {l.nativeName}</span>}
              </span>
              <span className="text-xs text-muted">{(l.script ?? "Latin")} · {l.direction.toUpperCase()}</span>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={l.aiEnrichmentEnabled ?? true} onChange={() => toggleEnrichment(l)} /> AI enrichment
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={l.enabled} onChange={() => toggle(l)} /> Enabled
              </label>
              <button
                className="text-xs text-accent hover:underline disabled:opacity-50 disabled:no-underline"
                disabled={enriching === l.id}
                onClick={() => enrichExisting(l)}
                title="Generate translations for existing meanings that don't have one in this language yet"
              >
                {enriching === l.id ? "Enriching…" : "Enrich existing meanings"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <Field label="Search language to add">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="German"
          />
        </Field>
        {suggestions.length > 0 && !picked && (
          <div className="mt-1 border border-border rounded-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.code}
                onClick={() => pick(s)}
                className="w-full text-start px-3 py-1.5 text-sm hover:bg-foreground/5 flex items-center justify-between"
              >
                <span>{s.name} <span className="text-muted">· {s.nativeName}</span></span>
                <span className="text-xs text-muted">{s.code}</span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Badge value="VERIFIED" label={`${picked.name} (${picked.nativeName}) — ${picked.code}, ${picked.script}, ${picked.direction.toUpperCase()}`} />
            <button onClick={() => setAdvanced((a) => !a)} className="text-xs text-muted hover:text-foreground underline">
              {advanced ? "Hide" : "Edit"} details
            </button>
            <Button onClick={create}>Add language</Button>
          </div>
        )}

        {(advanced || (!picked && query.trim() && suggestions.length === 0)) && (
          <div className="mt-3 flex gap-2 items-end flex-wrap">
            {!picked && query.trim() && suggestions.length === 0 && (
              <p className="text-xs text-muted basis-full">Not in the predefined list — enter details manually.</p>
            )}
            <Field label="Code">
              <Input className="w-24" value={code} onChange={(e) => setCode(e.target.value)} placeholder="de" />
            </Field>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="German" />
            </Field>
            <Field label="Native name">
              <Input value={nativeName} onChange={(e) => setNativeName(e.target.value)} placeholder="Deutsch" />
            </Field>
            <Field label="Script">
              <Input className="w-28" value={script} onChange={(e) => setScript(e.target.value)} placeholder="Latin" />
            </Field>
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as "ltr" | "rtl")}>
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </Select>
            </Field>
            <Button onClick={create} disabled={!code.trim() || !name.trim()}>Add language</Button>
          </div>
        )}
      </div>
    </div>
  );
}
