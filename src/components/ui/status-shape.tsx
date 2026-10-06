import type { CSSProperties, ReactNode } from "react";
import type { TestStatus } from "@/lib/desk-types";

export const STATUS_WORD: Record<TestStatus, string> = { met: "Met", watching: "Watching", not_met: "Not met", no_data: "No data" };

// design-dna 2.6: ink shapes, 12 px, viewBox 0 0 12 12. Colour never carries the meaning.
const SHAPES: Record<TestStatus, ReactNode> = {
  met: <circle cx="6" cy="6" r="5" fill="currentColor" />,
  watching: (
    <>
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor" />
    </>
  ),
  not_met: <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  no_data: <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />,
};

type Props = { status: TestStatus; withWord?: boolean; size?: 12 | 20; tick?: boolean; index?: number };

export function StatusShape({ status, withWord = true, size = 12, tick = false, index = 0 }: Props) {
  const style = tick ? ({ "--i": Math.min(index, 7) } as CSSProperties) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5 text-ink" data-status={status}>
      <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" className={tick ? "status-tick" : undefined} style={style}>
        {SHAPES[status]}
      </svg>
      <span className={withWord ? undefined : "sr-only"}>{STATUS_WORD[status]}</span>
    </span>
  );
}
