import { cn } from "@/lib/utils";

export type BlockLabel = "VIEW" | "TESTS" | "FACTS" | "HISTORY" | "SOURCES" | "SCENARIO" | "LINKS";

// design-dna s17 item 6: the label is the facts-vs-view separation (VIEW = the hand = Aksh's words).
const LABEL_STYLE: Record<BlockLabel, string> = {
  VIEW: "border border-geru bg-geru text-on-geru",
  TESTS: "border border-ink text-ink",
  FACTS: "border border-dashed border-ink text-ink",
  HISTORY: "border border-dotted border-ink text-ink",
  SOURCES: "border border-rule-strong text-ink-muted",
  SCENARIO: "border border-rule-strong text-ink-muted",
  LINKS: "border border-rule-strong text-ink-muted",
};

type Props = { label: BlockLabel; title: string; sub?: string; count?: number | string; id: string };

export function BlockHeader({ label, title, sub, count, id }: Props) {
  return (
    <header className="mb-(--stack) border-b border-rule pb-3">
      <span className={cn("inline-block rounded-sm px-1.5 py-0.5 font-mono text-mono-label uppercase", LABEL_STYLE[label])}>{label}</span>
      <h2 id={id} data-section className="mt-2 text-title text-ink desk:text-title-desk">
        {title}
        {count !== undefined ? <span className="ml-2 tabular-nums text-ink-muted">{count}</span> : null}
      </h2>
      {sub ? <p className="mt-1 text-small text-ink-muted desk:text-small-desk">{sub}</p> : null}
    </header>
  );
}
