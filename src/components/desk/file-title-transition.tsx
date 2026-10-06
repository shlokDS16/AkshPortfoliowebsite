import * as React from "react";
import type { FileNo } from "@/lib/desk-types";

type VTProps = { name: string; share?: string; default?: string; children: React.ReactNode };

// Next bundles canary React, which exports ViewTransition; the stable react@19.2.8 that Vitest resolves does not
// (checked 2026-10-06), so this falls back to plain children there (Plan 1B D21).
const VT = (React as unknown as { ViewTransition?: React.ComponentType<VTProps> }).ViewTransition;

/** Register company name -> file h1 morph (segment 6): 220 ms via ::view-transition-group(.morph) in globals.css. */
export function FileTitleTransition({ fileNo, children }: { fileNo: FileNo; children: React.ReactNode }) {
  if (!VT) return <>{children}</>;
  return (
    <VT name={`file-${fileNo}`} share="morph" default="none">
      {children}
    </VT>
  );
}
