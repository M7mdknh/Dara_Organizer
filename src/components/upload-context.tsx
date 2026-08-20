"use client";

import { createContext, useContext } from "react";

interface UploadContextValue {
  openUpload: () => void;
}

export const UploadContext = createContext<UploadContextValue | null>(null);

/** Opens the global simplified upload flow from anywhere inside AppShell. */
export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within AppShell");
  return ctx;
}
