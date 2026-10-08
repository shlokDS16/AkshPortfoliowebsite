import { describe, expect, it } from "vitest";
import { etaFor } from "./inbox";
import { needsYouFrom } from "./needs-you";
import { trayFor, type DocState } from "./trays";
import { TRANSCRIPT_READY, TYPING_OUT, VOICE_NOT_STORED } from "./voice-copy";

// A voice note in the trays (ruling R13): typed out, then waiting for Aksh to check it; never counted as figures.

const NOW = new Date("2026-10-08T05:30:00Z");
const EARLIER = "2026-10-08T05:00:00.000Z";
type StepState = DocState["steps"][number];
const step = (over: Partial<StepState> = {}): StepState => ({
  kind: "transcribe", status: "queued", notBefore: EARLIER, waitReason: null, pageNo: 1, lastError: null, everClaimed: true, ...over,
});
const doc = (steps: StepState[], over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: null, pagesRead: 0, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps, ...over,
});

describe("a voice note in the trays", () => {
  it("waits to start, then is typed out, then waits for Aksh in Ready", () => {
    expect(trayFor(doc([step({ everClaimed: false })]), NOW, null)).toMatchObject({ tray: "waiting" });
    expect(trayFor(doc([step()]), NOW, null)).toMatchObject({ tray: "reading", message: TYPING_OUT });
    const done = trayFor(doc([step({ status: "done" })], { transcript: true }), NOW, null);
    expect(done).toMatchObject({ tray: "ready", message: "Your voice note is typed out. Check it, then save it as a capture." });
    expect(done.message).toBe(TRANSCRIPT_READY);
  });

  it("is not counted as figures and shows no pages read", () => {
    const view = trayFor(doc([step({ status: "done" })], { transcript: true, pending: 0, decided: 0 }), NOW, null);
    expect(view.message).not.toMatch(/figure/i);
    expect(view).toMatchObject({ extractDone: 0, extractTotal: 0, attentionPages: [] });
  });

  it("is not typed out before the step is done, even when a transcript flag is set", () => {
    expect(trayFor(doc([step()], { transcript: true }), NOW, null).tray).toBe("reading");
  });

  it("waits on the voice allowance with its own paused words", () => {
    const hour = step({ notBefore: "2026-10-08T06:30:00.000Z", waitReason: "voice_hour" });
    expect(trayFor(doc([hour]), NOW, null)).toMatchObject({ tray: "paused", message: "Waiting for the next hour of voice reading. It carries on by itself." });
    const day = step({ notBefore: "2026-10-09T05:30:00.000Z", waitReason: "voice_day" });
    expect(trayFor(doc([day]), NOW, null)).toMatchObject({ tray: "paused", message: "Today's free voice reading is used up. It carries on by itself within 24 hours." });
  });

  it("a note that could not be typed out says what it stored, and has no page list", () => {
    const stuck = trayFor(doc([step({ status: "needs_attention", lastError: VOICE_NOT_STORED })]), NOW, null);
    expect(stuck).toMatchObject({ tray: "attention", message: VOICE_NOT_STORED, attentionPages: [] });
    const bare = trayFor(doc([step({ status: "needs_attention", lastError: null })]), NOW, null);
    expect(bare.message).toBe("This voice note could not be typed out.");
  });

  it("is not part of the ready-by estimate (it uses no AI pages)", () => {
    expect(etaFor([step()], NOW)).toBeNull();
  });

  it("is Finished once Aksh has saved or thrown it away", () => {
    expect(trayFor(doc([step({ status: "done" })], { status: "done", transcript: false }), NOW, null)).toMatchObject({ tray: "finished" });
  });
});

describe("a typed-out voice note in Needs you", () => {
  const inboxDoc = (over: Record<string, unknown> = {}) => ({
    id: "d1", title: "Dealer call", company: null, createdAt: "2026-10-08T05:00:00Z", status: "active", kind: "audio", pageCount: 1, budget: 20,
    pending: 0, flagged: 0, decided: 0, transcript: "Dealers say orders are up.", pages: [],
    view: { tray: "ready", message: TRANSCRIPT_READY, attentionPages: [], extractDone: 0, extractTotal: 0 }, ...over,
  });

  it("earns a card that opens the inbox on that note", () => {
    const cards = needsYouFrom([inboxDoc()] as never);
    expect(cards).toEqual([{ id: "d1", title: "Dealer call", kind: "ready", message: TRANSCRIPT_READY, pagesUnread: false, href: "/desk/inbox#doc-d1" }]);
  });

  it("earns none once it is finished or when no transcript waits", () => {
    expect(needsYouFrom([inboxDoc({ status: "done" })] as never)).toEqual([]);
    expect(needsYouFrom([inboxDoc({ transcript: null })] as never)).toEqual([]);
  });
});
