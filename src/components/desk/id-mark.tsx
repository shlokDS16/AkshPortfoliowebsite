import { cn } from "@/lib/utils";
import type { FileNo } from "@/lib/desk-types";

type IdKind = "file" | "exhibit" | "source" | "revision" | "test";

/** The mark is the numbering (design-dna 11): mono, geru when it identifies, muted for test row labels. */
export function IdMark({ kind, value, muted = false }: { kind: IdKind; value: string; muted?: boolean }) {
  const quiet = muted || kind === "test";
  return (
    <span data-id-kind={kind} className={cn("font-mono text-mono-inline tabular-nums", quiet ? "text-ink-muted" : "text-geru")}>
      {value}
    </span>
  );
}

export function FileTag({ fileNo, revNo }: { fileNo: FileNo; revNo: number }) {
  return (
    <span className="file-tag inline-block bg-geru py-0.5 pr-2.5 pl-2 font-mono text-mono-tag uppercase text-on-geru">
      FILE {fileNo} · R{revNo}
    </span>
  );
}
