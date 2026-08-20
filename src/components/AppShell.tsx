"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UniversalSearch } from "@/components/UniversalSearch";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◫" },
  { href: "/explore", label: "Explore", icon: "🔍" },
  { href: "/words", label: "Words & Expressions", icon: "أ" },
  { href: "/sentences", label: "Sentences", icon: "≣" },
  { href: "/conversations", label: "Conversations", icon: "💬" },
  { href: "/responses", label: "Responses", icon: "⇄" },
  { href: "/categories", label: "Categories", icon: "▤" },
  { href: "/dialects", label: "Dialects", icon: "🗺" },
  { href: "/sources", label: "Media & Sources", icon: "⇪" },
  { href: "/review", label: "Review Inbox", icon: "☑" },
  { href: "/collections", label: "Collections", icon: "❖" },
  { href: "/datasets", label: "Datasets & Export", icon: "⬇" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppShell({
  user,
  children,
}: {
  user: { id: string; name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-e border-border bg-surface flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-border">
          <div className="font-semibold text-sm leading-tight">Arabic Dialect</div>
          <div className="text-xs text-muted">Data Platform</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
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
                {item.label}
              </Link>
            );
          })}
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
    </div>
  );
}
