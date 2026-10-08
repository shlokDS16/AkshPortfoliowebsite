import { describe, expect, it } from "vitest";
import { CHOOSING_FAILED } from "./steps/classify-pages";
import { trayFor, type DocState } from "./trays";

// classify_pages in the trays (Plan 2b Task 6): not a page step, so it never changes the figures count; the tray says the
// desk is choosing pages, waits with the AI allowance, and shows the step's own sentence when it stops.

const NOW = new Date("2026-10-08T05:30:00Z");
const EARLIER = "2026-10-08T05:00:00.000Z";
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "classify_pages", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 12, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: 80, pagesRead: 80, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps, ...over,
});

describe("classify_pages in the trays", () => {
  it("reads as choosing the pages to read, and does not count as a page of figures", () => {
    expect(trayFor(doc([step()]), NOW, null)).toMatchObject({ tray: "reading", message: "Choosing the pages to read.", extractTotal: 0 });
    const withFigures = doc([step(), step({ kind: "extract_page", pageNo: 4, status: "done" }), step({ kind: "extract_page", pageNo: 5, status: "queued" })]);
    expect(trayFor(withFigures, NOW, null)).toMatchObject({ tray: "reading", message: "Reading figures: 1 of 2 pages", extractTotal: 2 });
  });

  it("waits with the AI allowance when the small model's allowance is spent", () => {
    const waiting = step({ waitReason: "groq_day", notBefore: "2026-10-08T09:00:00.000Z" });
    expect(trayFor(doc([waiting]), NOW, null)).toMatchObject({ tray: "paused" });
  });

  it("shows the step's own sentence when it stops", () => {
    const stuck = step({ status: "needs_attention", lastError: CHOOSING_FAILED });
    expect(trayFor(doc([stuck]), NOW, null)).toMatchObject({ tray: "attention", message: CHOOSING_FAILED, attentionPages: [] });
  });
});
