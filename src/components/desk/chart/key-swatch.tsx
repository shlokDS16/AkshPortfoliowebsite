import type { ExhibitKeyMark } from "@/lib/view-types";

const LINE: Record<Exclude<ExhibitKeyMark, "withheld">, { className: string; dash?: string; width: number }> = {
  subject: { className: "stroke-ink", width: 2 },
  projection: { className: "stroke-ink", dash: "3 3", width: 2 },
  benchmark: { className: "stroke-bench", width: 1.5 },
  threshold: { className: "stroke-neel", dash: "5 4", width: 1.5 },
};

/** design-dna 2.7: ink subject, dashed projection, grey benchmark, dashed neel threshold, hatched withheld. */
export function KeySwatch({ mark }: { mark: ExhibitKeyMark }) {
  if (mark === "withheld") return <span aria-hidden className="hatch inline-block h-2.5 w-4" />;
  const line = LINE[mark];
  return (
    <svg aria-hidden width="20" height="8" viewBox="0 0 20 8">
      <line x1="0" y1="4" x2="20" y2="4" className={line.className} strokeWidth={line.width} strokeDasharray={line.dash} />
    </svg>
  );
}
