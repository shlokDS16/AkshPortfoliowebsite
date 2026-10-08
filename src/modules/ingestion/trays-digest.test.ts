import { describe, expect, it } from "vitest";
import { trayFor, type DocState } from "./trays";

// Commentary pages in the trays (ruling R13): a digest step is a page step, counted, listed when stuck, never "figures".

const NOW = new Date("2026-10-07T05:30:00Z");
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "digest_page", status: "queued", notBefore: "2026-10-07T05:00:00.000Z", waitReason: null, pageNo: 4, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], digestClaims = 0): DocState => ({ status: "active", pageCount: 40, pagesRead: 40, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, digestClaims, steps });

describe("commentary pages in the trays", () => {
  it("reads 'Reading commentary: 1 of 3 pages' while only digests are left", () => {
    const v = trayFor(doc([step({ pageNo: 4, status: "done" }), step({ pageNo: 5 }), step({ pageNo: 6 })]), NOW, "ready by 11:40");
    expect(v).toMatchObject({ tray: "reading", message: "Reading commentary: 1 of 3 pages, ready by 11:40", extractDone: 1, extractTotal: 3 });
  });

  it("keeps 'Reading figures' while a statement page is also being read, counting the digest page too", () => {
    const v = trayFor(doc([step({ pageNo: 4, status: "done" }), step({ kind: "extract_page", pageNo: 5 })]), NOW, null);
    expect(v).toMatchObject({ message: "Reading figures: 1 of 2 pages" });
  });

  it("lists a stuck digest page by number, not as the whole document", () => {
    const v = trayFor(doc([step({ pageNo: 9, status: "needs_attention", lastError: "x" }), step({ pageNo: 4, status: "done" })]), NOW, null);
    expect(v).toMatchObject({ tray: "attention", attentionPages: [9], message: "Page 9 could not be read." });
  });

  it("a document of only commentary pages says where the notes are", () => {
    expect(trayFor(doc([step({ status: "done" })], 2), NOW, null)).toMatchObject({
      tray: "ready",
      message: "Read. The commentary notes are in the document pane beside your file; there are no figures to check.",
    });
    expect(trayFor(doc([step({ status: "done" }), step({ kind: "extract_page", pageNo: 5, status: "done" })]), NOW, null).message).toBe("Read. No figures matched; open it beside your file.");
  });

  it("does not point at the pane when the digest found no claims", () => {
    expect(trayFor(doc([step({ status: "done" })], 0), NOW, null)).toMatchObject({ tray: "ready", message: "Read. No figures matched; open it beside your file." });
  });

  it("pauses like any page step", () => {
    const v = trayFor(doc([step({ waitReason: "groq_day", notBefore: "2026-10-07T09:00:00.000Z" })]), NOW, "ready by Thu 10:00");
    expect(v).toMatchObject({ tray: "paused" });
  });
});
