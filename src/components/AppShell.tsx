"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UniversalSearch } from "@/components/UniversalSearch";
import { SimpleUpload } from "@/components/SimpleUpload";
import { ImportWizard } from "@/components/ImportWizard";
import { Button } from "@/components/ui";
import { UploadContext } from "@/components/upload-context";

const NAV = [
  { href: "/dashboard", label: "Home", icon: "◫" },
  { href: "/data", label: "Data", icon: "≣" },
  { href: "/review", label: "Review", icon: "☑", countKey: "review" as const },
  { href: "/datasets", label: "Export", icon: "⬇" },
];

const SETTINGS_ITEM = { href: "/settings", label: "Settings", icon: "⚙" };

export function AppShell({
  user,
  reviewCount,
  children,
}: {
  user: { id: string; name: string; email: string; role: string };
  reviewCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [uploadMode, setUploadMode] = useState<"none" | "simple" | "advanced">("none");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function closeUpload() {
    setUploadMode("none");
  }

  function finishUpload() {
    setUploadMode("none");
    router.refresh();
  }

  return (
    <UploadContext.Provider value={{ openUpload: () => setUploadMode("simple") }}>
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-e border-border bg-surface flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-border">
          <div className="font-semibold text-sm leading-tight">DARA</div>
          <div className="text-xs text-muted">Arabic Dialect Data</div>
        </div>
        <div className="px-3 pt-3">
          <Button className="w-full" onClick={() => setUploadMode("simple")}>
            + Upload Data
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent/10 text-accent font-medium border-e-2 border-accent"
                    : "text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <span className="w-5 text-center text-xs opacity-70">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.countKey === "review" && !!reviewCount && (
                  <span className="text-[11px] rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 font-medium">
                    {reviewCount}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="my-2 border-t border-border" />
          <Link
            href={SETTINGS_ITEM.href}
            className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
              pathname === SETTINGS_ITEM.href || pathname.startsWith(SETTINGS_ITEM.href + "/")
                ? "bg-accent/10 text-accent font-medium border-e-2 border-accent"
                : "text-foreground/80 hover:bg-foreground/5"
            }`}
          >
            <span className="w-5 text-center text-xs opacity-70">{SETTINGS_ITEM.icon}</span>
            {SETTINGS_ITEM.label}
          </Link>
        </nav>
        <div className="border-t border-border px-4 py-3">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-xs text-muted mb-2">
            {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
          </div>
          <button onClick={logout} className="text-xs text-muted hover:text-foreground underline">
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur px-6 py-3">
          <UniversalSearch />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
      {uploadMode === "simple" && (
        <SimpleUpload onClose={closeUpload} onDone={finishUpload} onAdvanced={() => setUploadMode("advanced")} />
      )}
      {uploadMode === "advanced" && <ImportWizard onClose={closeUpload} onDone={finishUpload} />}
    </div>
    </UploadContext.Provider>
  );
}
