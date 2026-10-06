// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureListEntry, TodayGroup } from "@/modules/capture";
import { expectTokenOnly } from "@/test/ui";
import { deskQueue, QUEUE_EVENT, resetDeskQueueForTests } from "./desk-queue";
import { NeedsYouCard } from "./needs-you-card";
import { QueuedCard } from "./queued-card";
import { TodayList } from "./today-list";
import { Tray } from "./tray";

vi.mock("@/modules/capture/actions", () => ({ submitCapture: vi.fn() }));

afterEach(() => {
  resetDeskQueueForTests();
  window.localStorage.clear();
});

describe("Tray", () => {
  it("heads a state-named group with an ink count; explains itself when empty", () => {
    const { rerender } = render(<Tray title="Needs you" count={0} empty={{ body: "Nothing needs you." }} />);
    const tray = screen.getByRole("region", { name: /Needs you/ });
    expect(within(tray).getByText("Nothing needs you.")).toBeInTheDocument();
    rerender(
      <Tray title="Needs you" count={2} empty={{ body: "Nothing needs you." }}>
        <p>card</p>
      </Tray>,
    );
    expect(screen.getByText("2")).toHaveClass("tabular-nums");
    expect(screen.queryByText("Nothing needs you.")).toBeNull();
  });
});

describe("NeedsYouCard", () => {
  it("one problem, one action; tone is a rule, a glyph and a word, never colour alone; no override", () => {
    const { container } = render(
      <NeedsYouCard tone="bad" stateWord="Publish stopped" title="Kaveri Pumps" body="2 rules failed." action={{ label: "Open the gate notes", href: "/desk/items/1#gate" }} />,
    );
    const card = screen.getByRole("article");
    expect(card).toHaveClass("border-l-bad");
    expect(within(card).getByText("Publish stopped")).toHaveClass("text-bad");
    expect(card.querySelector("svg")).not.toBeNull();
    expect(within(card).getByRole("link", { name: "Open the gate notes" })).toHaveAttribute("href", "/desk/items/1#gate");
    expect(card.textContent).not.toMatch(/override|publish anyway/i);
    expectTokenOnly(container);
  });

  it("a form action renders a submit button instead of a link", () => {
    render(<NeedsYouCard tone="warn" stateWord="Not filed" title="t: $KAVPUMP" body="b" form={{ label: "File it now", action: async () => {} }} />);
    const card = screen.getByRole("article");
    expect(within(card).getByRole("button", { name: "File it now" })).toHaveAttribute("type", "submit");
    expect(within(card).queryByRole("link")).toBeNull();
  });
});

describe("the File it now button", () => {
  it("disables itself while the action runs, so a double tap cannot fire twice", async () => {
    let finish: () => void = () => {};
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<NeedsYouCard tone="warn" stateWord="Not filed" title="t" body="b" form={{ label: "File it now", action }} />);
    const button = screen.getByRole("button", { name: "File it now" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toBeDisabled();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(button).toBeEnabled();
  });
});

const entry = (over: Partial<CaptureListEntry>): CaptureListEntry => ({
  id: "x",
  rawText: "",
  createdAt: "2026-10-06T08:35:00Z",
  itemId: null,
  companyId: null,
  companySymbol: null,
  companyName: null,
  parseError: null,
  parsedMissing: false,
  ...over,
});
const GROUPS: TodayGroup[] = [
  { key: "c1", label: "KAVPUMP", entries: [entry({ id: "1", rawText: "t: $KAVPUMP receivables again", itemId: "i1", companyId: "c1", companySymbol: "KAVPUMP" })] },
  { key: "none", label: "No company", entries: [entry({ id: "2", rawText: "read an annual report", createdAt: "2026-10-06T04:00:00Z", parseError: "filing-failed" })] },
];

describe("TodayList and QueuedCard", () => {
  it("lists today's captures grouped by company with kind, time and a plain filing note", () => {
    render(<TodayList groups={GROUPS} known={{ symbols: ["KAVPUMP"], themes: [], ignoredSymbols: [], ignoredThemes: [] }} />);
    expect(screen.getByRole("heading", { name: "KAVPUMP" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No company" })).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("thesis");
    expect(rows[0]).toHaveTextContent("14:05");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/desk/items/i1");
    expect(rows[1]).toHaveTextContent("private note · Saved, but not filed as an item yet.");
    expect(document.body.textContent).not.toContain("filing-failed");
  });

  it("renders nothing for no groups", () => {
    const { container } = render(<TodayList groups={[]} known={{ symbols: ["KAVPUMP"], themes: [], ignoredSymbols: [], ignoredThemes: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an On this phone card only while notes wait to sync", () => {
    const { container } = render(<QueuedCard />);
    expect(container).toBeEmptyDOMElement();
    deskQueue().queue.enqueue({ clientId: "q", rawText: "x", source: "mobile", queuedAt: "2026-10-06T03:00:00Z" });
    act(() => window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { kind: "enqueued" } })));
    expect(screen.getByRole("article")).toHaveTextContent("On this phone");
  });
});
