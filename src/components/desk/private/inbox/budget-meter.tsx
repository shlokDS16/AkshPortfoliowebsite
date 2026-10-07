import type { CSSProperties } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STORAGE_REFUSE, STORAGE_WARN } from "@/modules/documents/client";

const MB = 1_048_576;
const GB = 1_073_741_824;

/** "412 MB", "1 GB": binary units, the way the free plan counts them. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${formatNumber(bytes / GB, 1)} GB`;
  if (bytes >= MB) return `${formatNumber(Math.round(bytes / MB), 0)} MB`;
  return `${formatNumber(Math.round(bytes / 1024), 0)} KB`;
}

type Props = { label: string; used: number; limit: number; /** What happens at the refuse line, said once the meter passes it. */ refuse?: string };

const TONE = { ok: "bg-ink", warn: "bg-warn", bad: "bg-bad" } as const;
const WORD = { ok: "text-ink", warn: "text-warn", bad: "text-bad" } as const;

/** A real quota against its real limit (spec s9), never a guess: warns at 70%, and past 90% says what is refused. */
export function BudgetMeter({ label, used, limit, refuse }: Props) {
  const share = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = share >= STORAGE_REFUSE ? "bad" : share >= STORAGE_WARN ? "warn" : "ok";
  return (
    <div data-tone={tone} className="space-y-1.5">
      <p className="flex items-baseline justify-between gap-3 text-small text-ink-muted">
        <span className={cn(tone !== "ok" && "font-semibold", WORD[tone])}>
          {label} <span className="tabular-nums">{formatBytes(used)}</span> of <span className="tabular-nums">{formatBytes(limit)}</span>
        </span>
        <span className="tabular-nums">{Math.round(share * 100)}%</span>
      </p>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} className="h-1.5 rounded-xs bg-surface-2">
        <div
          style={{ "--fill": share } as CSSProperties}
          className={cn("h-full w-full origin-left scale-x-(--fill) rounded-xs transition-transform duration-(--motion-slow) ease-snap motion-reduce:transition-none", TONE[tone])}
        />
      </div>
      {tone === "bad" && refuse ? <p className="text-small text-bad">{refuse}</p> : null}
    </div>
  );
}
