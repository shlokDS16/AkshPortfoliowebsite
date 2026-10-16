// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureListEntry, TodayGroup } from "@/modules/capture";
import { TodayList } from "./today-list";

const mocks = vi.hoisted(() => ({ link: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ startLinkAction: mocks.link }));
vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));

const known = { symbols: ["KAVPUMP"], themes: [], ignoredSymbols: [], ignoredThemes: [] };
const entry = (over: Partial<CaptureListEntry>): CaptureListEntry => ({
  id: "1", rawText: "", createdAt: "2026-10-08T08:30:00Z", itemId: null, companyId: null, companySymbol: null, companyName: null, parseError: null, parsedMissing: false, ...over,
} as CaptureListEntry);
const groups = (rawText: string, companyId: string | null = "c1"): TodayGroup[] => [{ key: companyId ?? "none", label: "KAVPUMP", entries: [entry({ rawText, companyId })] }];

beforeEach(() => mocks.link.mockReset().mockResolvedValue({ ok: true, documentId: "d-1" }));

describe("Read this link in the Today list", () => {
  it("shows the button only on a capture that holds a link, never reads it by itself", () => {
    render(<TodayList groups={[...groups("t: $KAVPUMP no link here"), ...groups("see https://www.bseindia.com/a.pdf")]} known={known} />);
    expect(screen.getAllByRole("button", { name: /Read this link/ })).toHaveLength(1);
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("opens the link on Aksh's click, filed under the capture's company, and says where to look", async () => {
    render(<TodayList groups={groups("n: $KAVPUMP results https://www.bseindia.com/a.pdf.")} known={known} />);
    const button = screen.getByRole("button", { name: "Read this link, www.bseindia.com" });
    expect(button).toHaveTextContent("Read this link");
    await userEvent.click(button);
    expect(mocks.link).toHaveBeenCalledWith({ url: "https://www.bseindia.com/a.pdf", companyId: "c1", filedOn: null });
    const done = await screen.findByRole("status");
    expect(within(done).getByRole("link", { name: "Open the inbox" })).toHaveAttribute("href", "/desk/inbox#doc-d-1");
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("sends no company for a capture that names none", async () => {
    render(<TodayList groups={groups("n: https://example.com/x", null)} known={known} />);
    await userEvent.click(screen.getByRole("button", { name: /Read this link/ }));
    expect(mocks.link).toHaveBeenCalledWith({ url: "https://example.com/x", companyId: null, filedOn: null });
  });

  it("shows the refusal in the server's fixed words and lets him try again", async () => {
    mocks.link.mockResolvedValueOnce({ ok: false, code: "link-failed", message: "The desk could not open that link. Check it, or paste the text instead." });
    render(<TodayList groups={groups("n: https://example.com/x")} known={known} />);
    await userEvent.click(screen.getByRole("button", { name: /Read this link/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The desk could not open that link. Check it, or paste the text instead.");
    expect(screen.getByRole("button", { name: /Read this link/ })).toBeEnabled();
  });
});

describe("the kind line of a Today entry", () => {
  it("names a read as a reading log entry", () => {
    render(<TodayList groups={groups("r: Marks memo #rates")} known={known} />);
    expect(screen.getByText("reading log")).toBeInTheDocument();
  });
});

describe("a source capture in the Today list (Phase 5d)", () => {
  it("is called a source, offers no 'Read this link' (the inbox would read the page into facts) and leads to Sources instead", () => {
    render(<TodayList groups={groups("s: https://youtu.be/abcdefghijk $KAVPUMP why the bull case is thin")} known={known} />);
    expect(screen.getByText("source")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Read this link/ })).toBeNull();
    expect(screen.getByRole("link", { name: "See it in Sources" })).toHaveAttribute("href", "/desk/sources");
  });

  it("a v: capture is a source while own videos are off, and is treated the same way", () => {
    const filed: TodayGroup[] = [{ key: "none", label: "No company", entries: [entry({ rawText: "v: https://youtu.be/abcdefghijk", isSource: true })] }];
    render(<TodayList groups={filed} known={known} />);
    expect(screen.getByText("source")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Read this link/ })).toBeNull();
  });

  it("a note with a link keeps the button", () => {
    render(<TodayList groups={groups("n: see https://www.bseindia.com/a.pdf")} known={known} />);
    expect(screen.getByRole("button", { name: /Read this link/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See it in Sources" })).toBeNull();
  });
});
