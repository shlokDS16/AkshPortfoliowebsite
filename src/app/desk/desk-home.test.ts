import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const listCapturesSince = vi.fn();

vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/modules/compliance", () => ({ listBlockedItems: vi.fn(async () => []) }));
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
// The real box needs the app router; the page only has to place it.
vi.mock("@/components/desk/private/capture-bar", () => ({ CaptureBar: () => createElement("div", { "data-testid": "capture-box" }, "BOX") }));

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
});
