import { describe, expect, it } from "vitest";
import { pageLabel } from "@/components/desk/private/inbox/page-label";
import { etaFor } from "./inbox";
import { OCR_KEY_REFUSED, OCR_TOO_BIG } from "./ocr-copy";
import { trayFor, type DocState } from "./trays";

// Scanned pages in the trays (ruling R13): attention pages, progress, the ETA and the paused copy count ocr_page steps too.

const NOW = new Date("2026-10-07T05:30:00Z");
const LATER = "2026-10-07T09:00:00.000Z";
const EARLIER = "2026-10-07T05:00:00.000Z";

type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "ocr_page", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 4, lastError: null, everClaimed: true, ...over,
});
const doc = (over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: 40, pagesRead: 40, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps: [], ...over,
});
const view = (over: Partial<DocState> = {}, eta: string | null = null) => trayFor(doc(over), NOW, eta);

describe("scanned pages in the trays", () => {
  it("count scan reads as pages read: 'Reading scanned pages: 3 of 12'", () => {
    const steps = [
      ...[1, 2, 3].map((pageNo) => step({ pageNo, status: "done" })),
      ...Array.from({ length: 9 }, (_, i) => step({ pageNo: 10 + i })),
    ];
    expect(view({ steps }, "ready by 11:40")).toMatchObject({
      tray: "reading",
      message: "Reading scanned pages: 3 of 12, ready by 11:40",
      extractDone: 3,
      extractTotal: 12,
    });
  });

  it("a scan that is read and then read for figures is one page, not two", () => {
    const steps = [step({ pageNo: 7, status: "done" }), step({ kind: "extract_page", pageNo: 7 })];
    expect(view({ steps })).toMatchObject({ tray: "reading", extractDone: 0, extractTotal: 1, message: "Reading figures: 0 of 1 pages" });
  });

  it("a scan page that could not be read needs attention, naming the page and why when every stuck page says the same", () => {
    expect(view({ steps: [step({ pageNo: 12, status: "needs_attention", lastError: OCR_TOO_BIG })] })).toMatchObject({
      tray: "attention",
      attentionPages: [12],
      message: `Page 12 could not be read. ${OCR_TOO_BIG}`,
    });
    const both = [step({ pageNo: 12, status: "needs_attention", lastError: OCR_TOO_BIG }), step({ pageNo: 13, status: "needs_attention", lastError: OCR_KEY_REFUSED })];
    expect(view({ steps: both }).message).toBe("Pages 12-13 could not be read.");
    const mixed = [step({ pageNo: 12, status: "needs_attention", lastError: OCR_TOO_BIG }), step({ kind: "extract_page", pageNo: 14, status: "needs_attention", lastError: OCR_TOO_BIG })];
    expect(view({ steps: mixed }).message).toBe("Pages 12, 14 could not be read.");
  });

  it("one stuck scan is not 'the whole document could not be read'", () => {
    const v = view({ pending: 3, steps: [step({ pageNo: 5, status: "needs_attention", lastError: "x" }), step({ pageNo: 6, status: "done" })] });
    expect(v.message).toBe("Page 5 could not be read. 3 figures are ready to check.");
  });

  it("pauses with the scan reader's own words", () => {
    const waiting = (waitReason: StepState["waitReason"]) => step({ waitReason, notBefore: LATER });
    expect(view({ steps: [waiting("ocr_day")] }, "ready by Thu 10:00")).toMatchObject({
      tray: "paused",
      message: "Today's free scan reading is used up. It carries on by itself within 24 hours.",
    });
    expect(view({ steps: [waiting("ocr_off")] }).message).toBe("Scan reading is off.");
    expect(view({ steps: [waiting("voice_day")] }).message).toBe("Today's free voice reading is used up. It carries on by itself within 24 hours.");
    expect(view({ steps: [waiting("voice_hour")] }).message).toBe("Waiting for the next hour of voice reading. It carries on by itself.");
  });

  it("names the day allowance before a minute wait when both are waiting", () => {
    const steps = [step({ kind: "extract_page", pageNo: 5, waitReason: "groq_minute", notBefore: LATER }), step({ pageNo: 6, waitReason: "ocr_day", notBefore: LATER })];
    expect(view({ steps }).message).toBe("Today's free scan reading is used up. It carries on by itself within 24 hours.");
  });

  it("a big scanned document nobody has ticked says how many pages are scans (pending Shlok approval)", () => {
    const done = [step({ kind: "select_pages", status: "done", pageNo: null })];
    expect(view({ pageCount: 100, scanPages: 90, steps: done })).toMatchObject({
      tray: "ready",
      message: "90 pages are scans. Tick the pages to read; each uses one of today's 375 scan reads.",
    });
    expect(view({ pageCount: 1, scanPages: 1, steps: done }).message).toBe("1 page is a scan. Tick the pages to read; each uses one of today's 375 scan reads.");
  });

  it("a cover page that has little text does not make a normal document a scanned one", () => {
    const done = [step({ kind: "select_pages", status: "done", pageNo: null })];
    expect(view({ pageCount: 100, scanPages: 1, steps: done }).message).toBe("Read. No figures matched; open it beside your file.");
    expect(view({ pageCount: 100, scanPages: 90, aiOn: false, steps: done }).message).toBe("Read. AI reading is off; open it beside your file to enter figures.");
  });
});

describe("the ETA counts scan reads", () => {
  it("counts every page step still to run", () => {
    const steps = [step({ pageNo: 4, waitReason: "groq_day" }), step({ kind: "extract_page", pageNo: 5, waitReason: "groq_day" }), step({ pageNo: 6, status: "done" })];
    expect(etaFor(steps, NOW)).not.toBeNull();
    expect(etaFor([step({ status: "done" })], NOW)).toBeNull();
  });
});

describe("pageLabel", () => {
  it("marks a scan page that has not been read, and drops the mark once it has a verdict", () => {
    expect(pageLabel({ kind: null, basis: null, scan: true })).toBe("Scanned page, not read yet");
    expect(pageLabel({ kind: "pl", basis: "consolidated", scan: true })).toBe("P&L · consolidated");
    expect(pageLabel({ kind: null, basis: null })).toBe("Not a statement page");
  });
});
