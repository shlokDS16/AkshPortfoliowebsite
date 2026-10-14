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
