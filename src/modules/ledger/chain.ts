import { anchorBrokenText, CHAIN_LIMIT_TEXT, chainBrokenText, chainOkText } from "@/lib/messages-ledger";
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

/**
 * What a screen may say about a check that ran. A pass carries the "consistent with itself" line and the standing limit text
 * in one structure (`lines` holds both, in order), so a screen cannot show the one without the other. A failure carries one line
 * per failed check and nothing reassuring. A check that could not run throws (`checkLedger`): that is "could not check",
 * never "intact".
 */
export type ChainReport =
  | { ok: true; headline: string; limit: string; lines: [string, string] }
  | { ok: false; lines: string[] };

export function chainReport(status: ChainStatus): ChainReport {
  if (status.ok) {
    const headline = chainOkText(status.events, status.sealedDays);
    return { ok: true, headline, limit: CHAIN_LIMIT_TEXT, lines: [headline, CHAIN_LIMIT_TEXT] };
  }
  return {
    ok: false,
    lines: status.problems.map((p) => (p.source === "chain" ? chainBrokenText(p.firstBadSeq) : anchorBrokenText(p.firstBadDate, p.reason))),
  };
}

/** The lines the screen shows: the pass line with its limit, otherwise one per failed check. */
export function chainLines(status: ChainStatus): string[] {
  return chainReport(status).lines;
}
