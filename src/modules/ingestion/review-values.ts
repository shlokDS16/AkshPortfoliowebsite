import type { Basis } from "@/modules/documents/client";
import { CORE_LINES, normaliseLabel } from "./relevance";
import type { ProposalView } from "./review-types";

// Which figures the values list shows and in what order (spec s6.5). Pure, browser-safe: the server builds the list and
// the screen rebuilds it as figures are resolved.

const TOPICS = [...new Set(CORE_LINES.map((c) => c.topic))];
const OTHER = "Other figures";
const coreRank = (label: string) => {
  const n = normaliseLabel(label);
  const at = CORE_LINES.findIndex((c) => c.match.test(n));
  return at === -1 ? CORE_LINES.length : at;
};

/** Figures that can still be filed: not yet filed, not waiting on a check, and not a flagged one Aksh dropped. */
export const isListed = (v: { status: string; flags: readonly unknown[] }): boolean =>
  v.status !== "filed" && !(v.flags.length > 0 && (v.status === "pending" || v.status === "rejected"));

type Line = Pick<ProposalView, "id" | "label" | "period" | "page" | "basis">;
const sameLine = (a: Line, b: Line) => normaliseLabel(a.label) === normaliseLabel(b.label) && a.period === b.period && (a.period !== "" || a.page === b.page);

/** Ids of the figures printed on the other basis that the preferred basis already shows (the standalone repeat of a consolidated line). */
export function basisRepeats(rows: Line[], preferred: Basis): Set<string> {
  const keep = rows.filter((r) => r.basis === preferred);
  return new Set(rows.filter((r) => r.basis !== null && r.basis !== preferred && keep.some((k) => sameLine(k, r))).map((r) => r.id));
}

/** The values list: topics in the order of the core lines then "Other figures"; inside a topic the core lines first, then by page. */
export function groupValues(rows: ProposalView[], preferred: Basis): { values: { topic: string; rows: ProposalView[] }[]; hiddenBasis: number } {
  const listed = rows.filter(isListed);
  const repeats = basisRepeats(listed, preferred);
  const shown = listed.filter((r) => !repeats.has(r.id));
  const topics = [...TOPICS, ...new Set(shown.map((r) => r.topic).filter((t) => !TOPICS.includes(t as (typeof TOPICS)[number]) && t !== OTHER)), OTHER];
  const values = topics
    .map((topic) => ({
      topic,
      rows: shown.filter((r) => r.topic === topic).sort((a, b) => coreRank(a.label) - coreRank(b.label) || a.page - b.page || a.label.localeCompare(b.label)),
    }))
    .filter((g) => g.rows.length > 0);
  return { values, hiddenBasis: repeats.size };
}
