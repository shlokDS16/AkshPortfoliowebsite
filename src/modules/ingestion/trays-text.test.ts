import { describe, expect, it } from "vitest";
import { trayFor, type DocState } from "./trays";
import { TEXT_EMPTY } from "./steps/text-pages";

// Pasted text and a web page in the trays (Plan 2b Task 5): the page-making step reads like the PDF's.

const NOW = new Date("2026-10-08T05:30:00Z");
const EARLIER = "2026-10-08T05:00:00.000Z";
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "text_pages", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 1, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: null, pagesRead: 0, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps, ...over,
});

describe("text_pages in the trays", () => {
  it("waits to start, then reads page by page like a PDF", () => {
    expect(trayFor(doc([step({ everClaimed: false })]), NOW, null)).toMatchObject({ tray: "waiting" });
    expect(trayFor(doc([step()], { pageCount: 4, pagesRead: 2 }), NOW, null)).toMatchObject({ tray: "reading", message: "Reading page 2 of 4" });
    expect(trayFor(doc([step()]), NOW, null)).toMatchObject({ tray: "reading", message: "Reading page 1" });
  });

  it("shows the step's own sentence when it stops", () => {
    const stuck = step({ status: "needs_attention", lastError: TEXT_EMPTY });
    expect(trayFor(doc([stuck]), NOW, null)).toMatchObject({ tray: "attention", message: TEXT_EMPTY });
  });
});
