import { cn } from "@/lib/utils";
import type { CaseEntryView } from "@/modules/showcase";

/** The machine's face: mono, a dashed rule on the left (the FACTS vocabulary of the file page). Dates, days and fingerprints only. */
export function Machine({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div data-machine className={cn("border-l border-dashed border-rule-strong pl-3 font-mono text-mono-tag tabular-nums text-ink-muted", className)}>{children}</div>;
}

/** His words, quoted and labelled with when they were sealed: the reading face with the one ink rule (R1 row 3). Never mono. */
export function HisWords({ entry }: { entry: Pick<CaseEntryView, "sealedLabel" | "words"> }) {
  return (
    <figure>
      <figcaption className="mb-1 font-mono text-mono-label uppercase tabular-nums text-geru">{entry.sealedLabel}</figcaption>
      <blockquote className="prose-read whitespace-pre-wrap border-l-2 border-ink pl-3 text-read text-ink-body desk:pl-4 desk:text-read-desk">{entry.words}</blockquote>
    </figure>
  );
}

/** One revealed entry: what the desk says about it, his words, then the machine's lines (when written, fingerprint, listing). */
export function CaseEntry({ entry }: { entry: CaseEntryView }) {
  return (
    <div className="space-y-2">
      {entry.lead ? <p className="text-body text-ink">{entry.lead}</p> : null}
      <HisWords entry={entry} />
      <Machine>
        <p>
          {entry.writtenLine} Fingerprint <code className="break-all">{entry.hash}</code>.
        </p>
        {entry.listedLine ? <p className="mt-1">{entry.listedLine}</p> : null}
      </Machine>
    </div>
  );
}
