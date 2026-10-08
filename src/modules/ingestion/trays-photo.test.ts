import { describe, expect, it } from "vitest";
import { etaFor } from "./inbox";
import { IMAGE_NOT_STORED } from "./ocr-copy";
import { PAGE_STEP_KINDS } from "./page-steps";
import { trayFor, type DocState } from "./trays";

// A photo in the trays (ruling R13): its scan read and its vision read are one page, counted with the page steps.

const NOW = new Date("2026-10-08T05:30:00Z");
const EARLIER = "2026-10-08T05:00:00.000Z";
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "ocr_page", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 1, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: 1, pagesRead: 1, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps, ...over,
});

describe("a photo in the trays", () => {
  it("vision_page is a page step", () => {
    expect(PAGE_STEP_KINDS).toContain("vision_page");
  });

  it("is read as the scan reader first, then as figures: one page throughout", () => {
    expect(trayFor(doc([step()]), NOW, null)).toMatchObject({ tray: "reading", message: "Reading scanned pages: 0 of 1", extractTotal: 1 });
    const second = [step({ status: "done" }), step({ kind: "vision_page" })];
    expect(trayFor(doc(second), NOW, null)).toMatchObject({ tray: "reading", message: "Reading figures: 0 of 1 pages", extractDone: 0, extractTotal: 1 });
    expect(trayFor(doc([step({ status: "done" }), step({ kind: "vision_page", status: "done" })], { pending: 3 }), NOW, null)).toMatchObject({
      tray: "ready", message: "3 figures ready to check.", extractDone: 1, extractTotal: 1,
    });
  });

  it("a vision read that could not finish names page 1 and the reason it stored", () => {
    const stuck = [step({ status: "done" }), step({ kind: "vision_page", status: "needs_attention", lastError: "x" })];
    expect(trayFor(doc(stuck), NOW, null)).toMatchObject({ tray: "attention", attentionPages: [1], message: "Page 1 could not be read." });
    const gone = [step({ status: "needs_attention", lastError: IMAGE_NOT_STORED })];
    expect(trayFor(doc(gone), NOW, null).message).toBe(`Page 1 could not be read. ${IMAGE_NOT_STORED}`);
  });

  it("waits on the AI allowance like any page", () => {
    const waiting = [step({ status: "done" }), step({ kind: "vision_page", notBefore: "2026-10-08T09:00:00.000Z", waitReason: "groq_minute" })];
    expect(trayFor(doc(waiting), NOW, null)).toMatchObject({ tray: "paused", message: "Waiting a minute for the AI allowance." });
  });

  it("counts toward the ready-by estimate until it is done", () => {
    expect(etaFor([step({ status: "done" }), step({ kind: "vision_page" })], NOW)).not.toBeNull();
    expect(etaFor([step({ status: "done" }), step({ kind: "vision_page", status: "done" })], NOW)).toBeNull();
  });
});
