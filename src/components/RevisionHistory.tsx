"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Button, Spinner, EmptyState, confirmDanger } from "@/components/ui";

interface Revision {
  id: string;
  kind: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

function ValuePreview({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted">—</span>;
  if (typeof value === "object") {
    return (
      <pre className="text-[11px] whitespace-pre-wrap break-words bg-foreground/5 rounded p-1.5 max-h-32 overflow-y-auto">
        {JSON.stringify(value, null, 1)}
      </pre>
    );
  }
  return <span>{String(value)}</span>;
}

export function RevisionHistory({
  entityType,
  entityId,
  restorable,
  onRestored,
}: {
  entityType: string;
  entityId: string;
  restorable?: boolean;
  onRestored?: () => void;
}) {
  const { data, loading, refetch } = useApi<{ items: Revision[] }>(
    `/api/revisions?entityType=${entityType}&entityId=${entityId}`,
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (!data?.items.length) return <EmptyState title="No revisions yet" hint="Edits will appear here" />;

  return (
    <div className="space-y-2">
      {data.items.map((r) => (
        <div key={r.id} className="border border-border rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{r.kind}</span>
            <span className="text-xs text-muted">
              {r.user?.name ?? "System"} · {new Date(r.createdAt).toLocaleString()}
            </span>
          </div>
          {r.reason && <div className="text-xs text-muted mb-1.5">{r.reason}</div>}
          {(r.oldValue != null || r.newValue != null) && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <div className="text-[10px] uppercase text-muted mb-0.5">Before</div>
                <ValuePreview value={r.oldValue} />
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted mb-0.5">After</div>
                <ValuePreview value={r.newValue} />
              </div>
            </div>
          )}
          {restorable && r.kind === "UPDATE" && r.oldValue != null && (
            <div className="mt-2">
              <Button
                variant="secondary"
                disabled={restoringId === r.id}
                onClick={async () => {
                  if (!confirmDanger("Restore the values captured in this revision?")) return;
                  setRestoringId(r.id);
                  try {
                    await api(`/api/revisions/${r.id}/restore`, { method: "POST" });
                    await refetch();
                    onRestored?.();
                  } finally {
                    setRestoringId(null);
                  }
                }}
              >
                {restoringId === r.id ? "Restoring…" : "Restore this version"}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
