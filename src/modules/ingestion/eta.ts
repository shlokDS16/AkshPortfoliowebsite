import { istDate, istTime, istWeekday } from "@/lib/dates";
import { DRAIN_MS, PUMP_EVERY_MIN } from "./caps";

// When a document's figures will be ready (spec s7 "ready by Thu 10:00", s9 throughput). Pure: no clock, no I/O.

export type Eta = { readyBy: Date; limitedBy: "minute" | "day" | null };

export type EtaInput = {
  pagesLeft: number;
  tokensPerPage: number;
  /** Tokens spent in the bucket's rolling 24 hours (reserve_usage counts the same window). */
  usedToday: number;
  caps: { tpm: number; tpd: number };
  now: Date;
  /** A keep-reading tab drains continuously; without one, only the 15-minute pump runs. */
  tabOpen: boolean;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Minutes to read `pages` pages at the minute cap: back to back with the tab open, one pump run per 15 min without. */
function paceMinutes(pages: number, i: EtaInput): number {
  if (pages <= 0) return 0;
  if (i.tabOpen) return Math.ceil((pages * i.tokensPerPage) / i.caps.tpm);
  const perRun = Math.max(1, Math.floor((i.caps.tpm * (DRAIN_MS.pump / MINUTE_MS)) / i.tokensPerPage));
  return Math.ceil(pages / perRun) * PUMP_EVERY_MIN;
}

export function estimateReadyBy(i: EtaInput): Eta {
  if (i.pagesLeft <= 0) return { readyBy: i.now, limitedBy: null };
  const at = (ms: number) => new Date(i.now.getTime() + ms);
  const fitToday = Math.max(0, Math.floor((i.caps.tpd - i.usedToday) / i.tokensPerPage));
  if (i.pagesLeft <= fitToday) return { readyBy: at(paceMinutes(i.pagesLeft, i) * MINUTE_MS), limitedBy: "minute" };
  // Today's allowance runs out: what is left starts as the rolling day frees up, a full day's pages per 24 hours.
  const perDay = Math.max(1, Math.floor(i.caps.tpd / i.tokensPerPage));
  const rest = i.pagesLeft - fitToday;
  const days = Math.ceil(rest / perDay);
  const lastDay = rest - (days - 1) * perDay;
  return { readyBy: at(days * DAY_MS + paceMinutes(lastDay, i) * MINUTE_MS), limitedBy: "day" };
}

/** "ready by 11:40" on the same India day, "ready by Thu 10:00" otherwise; rounded up so it never promises early. */
export function formatReadyBy(eta: Eta, now: Date): string {
  const at = new Date(Math.ceil(eta.readyBy.getTime() / MINUTE_MS) * MINUTE_MS);
  const time = istTime(at);
  return istDate(at) === istDate(now) ? `ready by ${time}` : `ready by ${istWeekday(at)} ${time}`;
}
