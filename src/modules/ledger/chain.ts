import { anchorBrokenText, chainBrokenText, chainOkText } from "@/lib/messages-ledger";
import type { ChainCheckRows, ChainProblem, ChainStatus } from "./types";

/**
 * Both integrity checks, one answer. The chain check proves the stored entries are consistent with themselves; the
 * sealed-day comparison proves they agree with the days already sealed. A problem from either one fails the whole.
 * Each problem names the check that found it.
 */
export function combineChecks(rows: ChainCheckRows): ChainStatus {
  const problems: ChainProblem[] = [];
  if (rows.chain.ok !== true) problems.push({ source: "chain", firstBadSeq: rows.chain.firstBadSeq, badIdea: rows.chain.badIdea });
  if (rows.anchors.ok !== true) problems.push({ source: "anchors", firstBadDate: rows.anchors.firstBadDate, reason: rows.anchors.reason });
  return { ok: problems.length === 0, events: rows.chain.events, sealedDays: rows.anchors.days, problems };
}

/** The lines the screen shows: one if all is well, otherwise one per failed check. */
export function chainLines(status: ChainStatus): string[] {
  if (status.ok) return [chainOkText(status.events, status.sealedDays)];
  return status.problems.map((p) => (p.source === "chain" ? chainBrokenText(p.firstBadSeq) : anchorBrokenText(p.firstBadDate, p.reason)));
}
