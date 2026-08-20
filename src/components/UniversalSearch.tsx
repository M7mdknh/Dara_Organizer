"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function UniversalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything — الحين, greetings, ASK_WELLBEING…  (Ctrl+K)"
          dir="auto"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
    </form>
  );
}
