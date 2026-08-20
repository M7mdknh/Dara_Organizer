"use client";

import Link from "next/link";
import { useLookups, dialectOptions } from "@/components/lookups";
import { PageHeader, Spinner, EmptyState } from "@/components/ui";

export default function DialectsPage() {
  const lookups = useLookups();
  if (!lookups) return <Spinner />;
  if (!lookups.dialects.length) {
    return (
      <div>
        <PageHeader title="Dialects" />
        <EmptyState title="No dialects configured" hint="Add them in Settings → Dialects" />
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Dialects" subtitle="Per-dialect coverage dashboards" />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {dialectOptions(lookups.dialects).map((d) => (
          <Link key={d.id} href={`/dialects/${d.id}`} className="card p-4 hover:border-accent transition-colors">
            <div className="font-medium whitespace-pre">{d.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
