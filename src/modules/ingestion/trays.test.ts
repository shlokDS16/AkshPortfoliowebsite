import { describe, expect, it } from "vitest";
import { trayFor, type DocState } from "./trays";

const NOW = new Date("2026-10-07T05:30:00Z");
const LATER = "2026-10-07T09:00:00.000Z";
const EARLIER = "2026-10-07T05:00:00.000Z";

type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "extract_page", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 4, lastError: null, everClaimed: true, ...over,
});
const doc = (over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: 312, pagesRead: 88, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps: [], ...over,
});
const view = (over: Partial<DocState> = {}, eta: string | null = "ready by 11:40") => trayFor(doc(over), NOW, eta);

describe("trayFor (spec s7), in the order the rules apply", () => {
  it("done and skipped documents are finished, whatever their steps say", () => {
    expect(view({ status: "done", steps: [step({ status: "needs_attention" })] }).tray).toBe("finished");
    expect(view({ status: "skipped", pending: 3 }).tray).toBe("finished");
  });

  it("an upload that never finished waits and says how to resume", () => {
    expect(view({ status: "uploading" })).toMatchObject({
      tray: "waiting",
      message: "Upload not finished. Choose the file again to resume.",
    });
  });

  it("a page that could not be read needs attention, naming the page", () => {
    expect(view({ steps: [step({ status: "needs_attention", pageNo: 142 })] })).toMatchObject({
      tray: "attention",
      message: "Page 142 could not be read.",
      attentionPages: [142],
    });
  });

  it("several pages in a row read as a range; a gap is listed", () => {
    const pages = [147, 142, 143, 144, 145, 146].map((pageNo) => step({ status: "needs_attention", pageNo }));
    expect(view({ steps: pages }).message).toBe("Pages 142-147 could not be read.");
    expect(view({ steps: pages }).attentionPages).toEqual([142, 143, 144, 145, 146, 147]);
    const gap = [142, 143, 150].map((pageNo) => step({ status: "needs_attention", pageNo }));
    expect(view({ steps: gap }).message).toBe("Pages 142-143, 150 could not be read.");
  });

  it("a PDF that cannot be opened says so, in the words the step stored", () => {
    const opened = step({ kind: "pdf_text", status: "needs_attention", pageNo: 1, lastError: null });
    expect(view({ steps: [opened] })).toMatchObject({
      tray: "attention",
      message: "This PDF could not be opened (it may be password-protected or damaged).",
      attentionPages: [],
    });
    const lost = step({ kind: "pdf_text", status: "needs_attention", pageNo: 1, lastError: "The original PDF is no longer stored, so its pages cannot be read." });
    expect(view({ steps: [lost] }).message).toBe("The original PDF is no longer stored, so its pages cannot be read.");
  });

  it("attention beats ready and carries the figures that are waiting", () => {
    const v = view({ pending: 24, steps: [step({ status: "needs_attention", pageNo: 142 })] });
    expect(v.tray).toBe("attention");
    expect(v.message).toBe("Page 142 could not be read. 24 figures are ready to check.");
    expect(view({ pending: 1, steps: [step({ status: "needs_attention", pageNo: 9 })] }).message).toBe(
      "Page 9 could not be read. 1 figure is ready to check.",
    );
  });

  it("steps that wait on the free allowance pause the document, with the day's time", () => {
    const waiting = (waitReason: StepState["waitReason"]) => step({ waitReason, notBefore: LATER });
    expect(view({ steps: [waiting("groq_day")] }, "ready by Thu 10:00")).toMatchObject({
      tray: "paused",
      message: "Today's free AI allowance is used up. It carries on by itself: ready by Thu 10:00.",
    });
    expect(view({ steps: [waiting("groq_minute")] }).message).toBe("Waiting a minute for the AI allowance.");
    expect(view({ steps: [waiting("ai_off")] }).message).toBe("AI reading is off.");
    expect(view({ steps: [waiting("groq_day")] }, null).message).toBe("Today's free AI allowance is used up. It carries on by itself.");
  });

  it("is not paused while one step can still run, or once the wait has passed", () => {
    const wait = step({ waitReason: "groq_day", notBefore: LATER });
    expect(view({ steps: [wait, step({ pageNo: 5 })] }).tray).toBe("reading");
    expect(view({ steps: [step({ waitReason: "groq_day", notBefore: EARLIER })] }).tray).toBe("reading");
  });

  it("never-claimed steps wait to start, even a first PDF read", () => {
    const first = step({ kind: "pdf_text", pageNo: 1, everClaimed: false });
    expect(view({ pagesRead: 0, pageCount: null, steps: [first] })).toMatchObject({
      tray: "waiting",
      message: "Queued. Starts within 15 minutes, sooner while this page is open.",
    });
  });

  it("an unfinished PDF read says how far it has got", () => {
    const reading = step({ kind: "pdf_text", pageNo: 89 });
    expect(view({ steps: [reading] })).toMatchObject({ tray: "reading", message: "Reading page 88 of 312" });
    expect(view({ pageCount: null, steps: [reading] }).message).toBe("Reading page 88");
    expect(view({ pagesRead: 0, steps: [reading] }).message).toBe("Reading page 1 of 312");
  });

  it("unfinished extract steps count the pages read and carry the ETA", () => {
    const steps = [
      ...[1, 2, 3, 4, 5, 6, 7].map((pageNo) => step({ pageNo, status: "done" })),
      ...Array.from({ length: 13 }, (_, i) => step({ pageNo: 10 + i })),
      step({ pageNo: 40, status: "skipped" }),
    ];
    expect(view({ steps }, "ready by 11:40")).toMatchObject({
      tray: "reading",
      message: "Reading figures: 7 of 20 pages, ready by 11:40",
      extractDone: 7,
      extractTotal: 20,
    });
    expect(view({ steps }, null).message).toBe("Reading figures: 7 of 20 pages");
  });

  it("choosing the pages is reading too, so a finished PDF read never looks done early", () => {
    const steps = [step({ kind: "pdf_text", status: "done", pageNo: 1 }), step({ kind: "select_pages", pageNo: null })];
    expect(view({ steps })).toMatchObject({ tray: "reading", message: "Choosing the pages to read." });
  });

  it("figures to check make the document ready, with the flagged ones named", () => {
    const done = [step({ status: "done" })];
    expect(view({ pending: 24, steps: done })).toMatchObject({ tray: "ready", message: "24 figures ready to check." });
    expect(view({ pending: 24, flagged: 2, steps: done }).message).toBe("24 figures ready to check. 2 need a look.");
    expect(view({ pending: 1, flagged: 1, steps: done }).message).toBe("1 figure ready to check. 1 needs a look.");
  });

  it("a document whose figures are all decided says so, not that nothing matched", () => {
    const done = [step({ kind: "select_pages", status: "done", pageNo: null })];
    expect(view({ decided: 3, steps: done })).toMatchObject({ tray: "ready", message: "All figures checked." });
    expect(view({ decided: 3, aiOn: false, steps: done }).message).toBe("All figures checked.");
    expect(view({ decided: 3, pending: 2, steps: done }).message).toBe("2 figures ready to check.");
  });

  it("nothing matched is still ready, and says what to do", () => {
    const done = [step({ kind: "select_pages", status: "done", pageNo: null })];
    expect(view({ steps: done })).toMatchObject({
      tray: "ready",
      message: "Read. No figures matched; open it beside your file.",
    });
  });

  it("with AI off the message does not claim the pages were looked at", () => {
    const done = [step({ kind: "select_pages", status: "done", pageNo: null })];
    expect(view({ aiOn: false, steps: done }).message).toBe("Read. AI reading is off; open it beside your file to enter figures.");
  });
});
