import type { ViewBlockData, ViewInline } from "@/lib/view-types";
import type { PublicFactCheck } from "./types";

/** `p. 131` is the only locator shape the ingestion writes. Anything else ("slide 7", "Note 12") gets no line. */
export function pageOfLocator(locator: string): number | null {
  const m = /^p\. (\d{1,5})$/.exec(locator.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Task 9 (R5, R19): puts "checked against page N" on a chip only when the item's latest checked page for that fact is
 * the page the fact's locator names today. A moved or re-sourced fact therefore shows no line, a withheld card shows
 * none, and nothing but a page number ever comes from the check.
 */
export function withFactChecks(blocks: ViewBlockData[], itemId: string, checks: PublicFactCheck[] | undefined): ViewBlockData[] {
  // `?? []`: a snapshot cached by an earlier deployment has no factChecks field.
  const pages = new Map((checks ?? []).filter((c) => c.itemId === itemId).map((c) => [c.factId, c.pageNo]));
  if (pages.size === 0) return blocks;
  const mark = (x: ViewInline): ViewInline => {
    if (typeof x === "string") return x;
    const { card } = x.chip;
    const page = pages.get(x.chip.chipId);
    return card.withheldUntil === null && page !== undefined && pageOfLocator(card.source.locator) === page
      ? { chip: { ...x.chip, card: { ...card, checkedPage: page } } }
      : x;
  };
  return blocks.map((b) => (b.kind === "p" ? { ...b, inline: b.inline.map(mark) } : b.kind === "ul" ? { ...b, items: b.items.map((i) => i.map(mark)) } : b));
}
