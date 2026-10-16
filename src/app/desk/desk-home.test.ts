import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const listCapturesSince = vi.fn();

vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/modules/compliance", () => ({ listBlockedItems: vi.fn(async () => []) }));
const monthCounts = vi.fn<(...args: unknown[]) => Promise<{ learnings: number; reads: number }>>(async () => ({ learnings: 0, reads: 0 }));
vi.mock("@/modules/knowledge", () => ({ createSupabaseKnowledgeDeps: () => ({}), monthCounts: (...a: unknown[]) => monthCounts(...a) }));
const needsYouDocs = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("./desk-data", () => ({
  needsYouDocs: () => needsYouDocs(),
  namesToReview: vi.fn(async () => 0),
  knownTokens: vi.fn(async () => ({ symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] })),
}));
vi.mock("@/modules/capture/actions", () => ({ refileCaptureAction: vi.fn() }));
vi.mock("@/modules/capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/capture")>()),
  listCapturesSince: (...args: unknown[]) => listCapturesSince(...args),
}));
// The real box needs the app router; the page only has to place it (and say whether the v: key is offered).
vi.mock("@/components/desk/private/capture-bar", () => ({
  CaptureBar: (props: { videoKey?: boolean }) => createElement("div", { "data-testid": "capture-box", "data-video-key": String(props.videoKey) }, "BOX"),
}));
const mondayLetterLine = vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => null);
vi.mock("@/modules/distribution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/distribution")>()),
  mondayLetterLine: (...args: unknown[]) => mondayLetterLine(...args),
}));

import DeskHome from "./page";

async function render(): Promise<string> {
  return renderToStaticMarkup(await DeskHome({ searchParams: Promise.resolve({}) }));
}

afterEach(() => vi.restoreAllMocks());

describe("DeskHome", () => {
  it("still renders the capture box, with a fixed notice, when today's captures cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    listCapturesSince.mockRejectedValueOnce(new Error("connection to db failed: password=hunter2"));
    const html = await render();
    expect(html).toContain("BOX");
    expect(html).toContain("Could not load today");
    expect(html).toContain('role="alert"');
    // Neither the page nor the log carries the database message.
    expect(html).not.toContain("hunter2");
    expect(JSON.stringify(error.mock.calls)).not.toContain("hunter2");
    expect(html).not.toContain("Capture streak");
  });

  it("renders the box, the streak strip and today's list when the read works", async () => {
    listCapturesSince.mockResolvedValueOnce([]);
    const html = await render();
    expect(html).toContain("BOX");
    expect(html).toContain("Logged research on 0 of the last 30 days.");
    expect(html).toContain("Nothing captured yet today.");
    expect(html).not.toContain("Could not load");
  });

  it("adds a neutral Ready to review card and a warn Pages could not be read card for the inbox's documents", async () => {
    listCapturesSince.mockResolvedValueOnce([]);
    needsYouDocs.mockResolvedValueOnce([
      { id: "d1", title: "Kaveri AR", kind: "ready", message: "24 figures ready to check.", pagesUnread: false, href: "/desk/inbox/d1/review" },
      { id: "d2", title: "Sahyadri AR", kind: "attention", message: "Pages 142-147 could not be read.", pagesUnread: true, href: "/desk/inbox#doc-d2" },
    ]);
    const html = await render();
    expect(html).toContain("Ready to review");
    expect(html).toContain("24 figures ready to check.");
    expect(html).toContain('href="/desk/inbox/d1/review"');
    expect(html).toContain("Pages could not be read");
    expect(html).toContain("Pages 142-147 could not be read.");
    expect(html).toContain('href="/desk/inbox#doc-d2"');
    expect(html).not.toContain("Nothing needs you.");
  });

  it("says nothing needs you when no document waits", async () => {
    listCapturesSince.mockResolvedValueOnce([]);
    const html = await render();
    expect(html).toContain("Nothing needs you.");
    expect(html).not.toContain("Ready to review");
  });

  it("adds one quiet line linking to the month page, with the month's counts", async () => {
    listCapturesSince.mockResolvedValueOnce([]);
    monthCounts.mockResolvedValueOnce({ learnings: 3, reads: 1 });
    const html = await render();
    expect(html).toMatch(/<a[^>]*href="\/desk\/learned"[^>]*>This month: <span[^>]*font-mono[^>]*>3 learnings, 1 read<\/span><\/a>/);
    expect(monthCounts.mock.calls.at(-1)?.[1]).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("a month that cannot be counted leaves the line out and the page standing; only the error's name is logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    listCapturesSince.mockResolvedValueOnce([]);
    monthCounts.mockRejectedValueOnce(new Error("relation concept_links: password=hunter2"));
    const html = await render();
    expect(html).toContain("BOX");
    expect(html).not.toContain("This month:");
    expect(JSON.stringify(error.mock.calls)).not.toContain("hunter2");
  });

  // Phase 5d (spec s8): the letters and the own-channel videos are off, so the home page has no Monday letter prompt, reads nothing for one, and the
  // capture box is not told to offer the v: key.
  describe("while the letters and own-channel videos are off", () => {
    it("shows no letter prompt and does not read the letter changes", async () => {
      vi.stubEnv("FEATURES_ON", "");
      mondayLetterLine.mockResolvedValue("What changed since the last letter");
      listCapturesSince.mockResolvedValueOnce([]);
      const html = await render();
      expect(mondayLetterLine).not.toHaveBeenCalled();
      expect(html).not.toContain("What changed since the last letter");
      expect(html).not.toContain("/desk/letters");
      expect(html).toContain('data-video-key="false"');
    });

    it("is the control: with the override the prompt and the key come back", async () => {
      vi.stubEnv("FEATURES_ON", "ownVideos,letters");
      mondayLetterLine.mockResolvedValue("What changed since the last letter");
      listCapturesSince.mockResolvedValueOnce([]);
      const html = await render();
      expect(html).toContain("What changed since the last letter");
      expect(html).toContain('data-video-key="true"');
    });
  });
});
