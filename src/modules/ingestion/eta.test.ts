import { describe, expect, it } from "vitest";
import { addDays, istDate } from "@/lib/dates";
import { GROQ_CAPS, TOKENS_PER_PAGE_DEFAULT } from "./caps";
import { estimateReadyBy, formatReadyBy } from "./eta";

const MIN = 60_000;
const NOW = new Date("2026-10-07T05:30:00Z"); // Wednesday 11:00 IST
const caps = { tpm: GROQ_CAPS.tpm, tpd: GROQ_CAPS.tpd };
const base = { pagesLeft: 20, tokensPerPage: TOKENS_PER_PAGE_DEFAULT, usedToday: 0, caps, now: NOW, tabOpen: true };

describe("estimateReadyBy (spec s9 throughput: 3,400 tokens a page at 6,000 TPM)", () => {
  it("is now, limited by nothing, when no pages are left", () => {
    expect(estimateReadyBy({ ...base, pagesLeft: 0 })).toEqual({ readyBy: NOW, limitedBy: null });
  });

  it("takes about 12 minutes for 20 pages while the tab keeps reading", () => {
    const eta = estimateReadyBy(base);
    expect(eta.limitedBy).toBe("minute");
    expect(eta.readyBy.getTime() - NOW.getTime()).toBe(12 * MIN);
  });

  it("takes three 15-minute pump runs (45 minutes) for 20 pages with the tab closed", () => {
    const eta = estimateReadyBy({ ...base, tabOpen: false });
    expect(eta.limitedBy).toBe("minute");
    expect(eta.readyBy.getTime() - NOW.getTime()).toBe(45 * MIN);
  });

  it("waits for the next day when today's allowance cannot cover the pages left", () => {
    const eta = estimateReadyBy({ ...base, usedToday: caps.tpd - 20_000 });
    expect(eta.limitedBy).toBe("day");
    expect(istDate(eta.readyBy)).toBe(addDays(istDate(NOW), 1));
  });

  it("stays on today when the allowance left covers every page", () => {
    const eta = estimateReadyBy({ ...base, usedToday: caps.tpd - 20 * TOKENS_PER_PAGE_DEFAULT });
    expect(eta.limitedBy).toBe("minute");
    expect(istDate(eta.readyBy)).toBe(istDate(NOW));
  });

  it("counts more than one day when the pages need more than a full day's allowance", () => {
    const pages = Math.floor(caps.tpd / TOKENS_PER_PAGE_DEFAULT) * 2 + 1; // two full days and a page
    const eta = estimateReadyBy({ ...base, pagesLeft: pages, usedToday: caps.tpd });
    expect(eta.limitedBy).toBe("day");
    expect(istDate(eta.readyBy)).toBe(addDays(istDate(NOW), 3));
  });

  it("counts at least one page per pump run, even when a page is bigger than a run's allowance", () => {
    const eta = estimateReadyBy({ ...base, pagesLeft: 2, tokensPerPage: caps.tpm * 4 + 1, tabOpen: false });
    expect(eta.readyBy.getTime() - NOW.getTime()).toBe(30 * MIN);
  });
});

describe("formatReadyBy (India time)", () => {
  it("prints the time alone on the same India day", () => {
    const eta = { readyBy: new Date("2026-10-07T06:10:00Z"), limitedBy: "minute" as const }; // 11:40 IST
    expect(formatReadyBy(eta, NOW)).toBe("ready by 11:40");
  });

  it("prints the weekday and time on another day", () => {
    const eta = { readyBy: new Date("2026-10-08T04:30:00Z"), limitedBy: "day" as const }; // Thursday 10:00 IST
    expect(formatReadyBy(eta, NOW)).toBe("ready by Thu 10:00");
  });

  it("rounds up to the next minute, never promising early", () => {
    const eta = { readyBy: new Date("2026-10-07T06:09:20Z"), limitedBy: "minute" as const }; // 11:39:20 IST
    expect(formatReadyBy(eta, NOW)).toBe("ready by 11:40");
  });

  it("uses the India day, not UTC, to decide what counts as today", () => {
    const lateNight = new Date("2026-10-07T18:00:00Z"); // 23:30 IST Wednesday
    const eta = { readyBy: new Date("2026-10-07T18:45:00Z"), limitedBy: "minute" as const }; // 00:15 IST Thursday
    expect(formatReadyBy(eta, lateNight)).toBe("ready by Thu 00:15");
  });
});
