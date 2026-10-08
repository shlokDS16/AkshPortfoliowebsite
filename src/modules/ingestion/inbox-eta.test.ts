import { describe, expect, it } from "vitest";
import { etaFor } from "./inbox";
import { trayFor, type DocState } from "./trays";

// The paused card (spec s7): when the day's allowance is spent, the ETA starts from the next day, in India time.
const step = (over: Partial<DocState["steps"][number]> = {}): DocState["steps"][number] => ({
  kind: "extract_page", status: "queued", notBefore: "2026-10-08T04:30:00.000Z", waitReason: "groq_day", pageNo: 4, lastError: null, everClaimed: true, ...over,
});

describe("the paused card's ETA", () => {
  // Wed 7 Oct 2026, 10:00 India time.
  const now = new Date("2026-10-07T04:30:00.000Z");

  it("says Thu 10:02 for three pages left once the day's allowance is spent", () => {
    const steps = [step({ pageNo: 4 }), step({ pageNo: 5 }), step({ pageNo: 6 })];
    expect(etaFor(steps, now)).toBe("ready by Thu 10:02");
    const state: DocState = { status: "active", pageCount: 312, pagesRead: 312, aiOn: true, pending: 0, flagged: 0, steps };
    expect(trayFor(state, now, etaFor(steps, now))).toMatchObject({
      tray: "paused",
      message: "Today's free AI allowance is used up. It carries on by itself: ready by Thu 10:02.",
    });
  });

  it("has no ETA when no figure page is left to read", () => {
    expect(etaFor([step({ kind: "pdf_text", status: "done" })], now)).toBeNull();
  });
});
