"use client";

import { useEffect } from "react";
import { containsArabic } from "@/services/normalization";

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Renders text with correct direction/font when Arabic. */
export function ArabicText({ text, className }: { text: string; className?: string }) {
  const isAr = containsArabic(text);
  return (
    <span dir={isAr ? "rtl" : "ltr"} className={cls(isAr && "arabic-text", className)}>
      {text}
    </span>
  );
}

const TIER_STYLES: Record<string, string> = {
  GOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SILVER: "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300",
  REFERENCE: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  CANDIDATE: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  VERIFIED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  UNVERIFIED: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  AI: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  HUMAN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  IMPORT: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ELIGIBLE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  NOT_ELIGIBLE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  UNDECIDED: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const style = TIER_STYLES[value] ?? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span className={cls("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", style)}>
      {label ?? value.replaceAll("_", " ")}
    </span>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "border border-border bg-surface hover:bg-foreground/5",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "hover:bg-foreground/5 text-muted hover:text-foreground",
  }[variant];
  return (
    <button
      className={cls(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={cls(
        "rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent w-full",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={cls(
        "rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent w-full",
        className,
      )}
      {...rest}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      className={cls(
        "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent",
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className={cls("card w-full p-6 mt-10 mb-10", wide ? "max-w-4xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="font-medium text-muted">{title}</p>
      {hint && <p className="text-sm text-muted/70 mt-1">{hint}</p>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted mt-3">
      <span>
        {total.toLocaleString()} records · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

/** Simple confirm wrapper for destructive actions. */
export function confirmDanger(message: string): boolean {
  return typeof window !== "undefined" && window.confirm(message);
}
