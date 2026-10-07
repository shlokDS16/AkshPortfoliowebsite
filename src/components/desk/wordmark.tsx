import { cn } from "@/lib/utils";

/** The AA tag mark: notched square, geru fill (design-dna 11). The favicon uses outlined glyphs instead. */
export function AaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <path d="M2 2H23L30 9V30H2Z" className="fill-geru" />
      <text x="15" y="22" textAnchor="middle" fontSize="13" fontWeight="600" className="fill-on-geru font-sans">
        AA
      </text>
    </svg>
  );
}

/** Published under Aksh's own name, never a desk brand (segment 5). */
export function Wordmark({ showMark = true }: { showMark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-body">
      {showMark ? <AaMark className="size-6 desk:size-[26px]" /> : null}
      <span>
        <span className="font-semibold text-ink">Aksh Agrawal</span> <span className="text-ink-muted">· Case files</span>
      </span>
    </span>
  );
}
