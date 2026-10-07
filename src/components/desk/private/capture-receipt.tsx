import type { CaptureReceiptModel, ReceiptChip } from "@/modules/capture/client";

const CHIP: Record<ReceiptChip["kind"], string> = {
  kind: "rounded-xs bg-surface-2 px-1.5 text-ink",
  company: "rounded-xs bg-geru-wash px-1.5 font-mono text-mono-id text-geru",
  "company-new": "rounded-xs bg-geru-wash px-1.5 font-mono text-mono-id text-geru underline decoration-dashed",
  theme: "rounded-xs bg-surface-2 px-1.5 font-mono text-mono-id text-ink",
  "theme-new": "rounded-xs bg-surface-2 px-1.5 font-mono text-mono-id text-ink underline decoration-dashed",
};

/** One line: "Will go to …" (design-dna 13.2). Chips swap instantly; no motion while typing. The status line says "queued". */
export function CaptureReceipt({ model }: { model: CaptureReceiptModel }) {
  return (
    <p aria-live="polite" className="flex min-h-6 flex-wrap items-center gap-1.5 text-small text-ink-muted">
      {model.empty ? (
        <span>Will go to: Today, as a private note</span>
      ) : (
        <>
          <span>Will go to</span>
          {model.chips.map((chip) => (
            <span key={chip.label} className={CHIP[chip.kind]}>
              {chip.label}
            </span>
          ))}
          {model.warning ? <span className="basis-full text-warn">{model.warning}</span> : null}
        </>
      )}
    </p>
  );
}
