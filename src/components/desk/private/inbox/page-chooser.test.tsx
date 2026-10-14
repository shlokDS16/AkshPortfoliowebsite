// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/modules/ingestion/client";
import { actionsMock, doc, OK, page, view } from "@/test/inbox-fixtures";
import { PageChooser } from "./page-chooser";

const mocks = vi.hoisted(() => ({ setBudget: vi.fn(), reread: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ setBudgetAction: mocks.setBudget, rereadPageAction: mocks.reread }));

beforeEach(() => {
  mocks.setBudget.mockReset().mockResolvedValue(OK);
});

describe("PageChooser", () => {
  const pages = [
    page(3, { kind: "mdna", firstLine: "Management Discussion and Analysis" }),
    page(4, { kind: "pl", basis: "consolidated", firstLine: "Consolidated Statement of Profit and Loss", selected: true, by: "rule" }),
    page(5, { kind: "bs", basis: "consolidated", firstLine: "Consolidated Balance Sheet as at March 31, 2026", selected: true, by: "rule" }),
  ];
  const full = doc({ budget: 2, pages, view: view("ready", "x", { extractDone: 1, extractTotal: 2 }) });

  it("lists pages with what they are, ticked ones checked, and the count against the limit", () => {
    render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actionsMock()} />);
    expect(screen.getByRole("checkbox", { name: "p. 4 P&L · consolidated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "p. 5 Balance sheet · consolidated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "p. 3 Management discussion" })).not.toBeChecked();
    expect(screen.getByText("2 of 2 allowed")).toBeInTheDocument();
    expect(screen.getByText("P&L · consolidated")).toBeInTheDocument();
  });

  it("ticks a page within the limit straight away, and unticks one", async () => {
    const actions = actionsMock();
    render(<PageChooser doc={{ ...full, budget: 5 }} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^p\. 3 / }));
    expect(actions.setPageSelected).toHaveBeenLastCalledWith(full.id, 3, true);
    await userEvent.click(screen.getByRole("checkbox", { name: /^p\. 4 / }));
    expect(actions.setPageSelected).toHaveBeenLastCalledWith(full.id, 4, false);
    expect(mocks.setBudget).not.toHaveBeenCalled();
  });

  it("shows a tick at once, before the server has answered, and springs back when it refuses", async () => {
    const actions = actionsMock();
    let answer: (r: ActionResult) => void = () => {};
    actions.setPageSelected = vi.fn(() => new Promise<ActionResult>((resolve) => (answer = resolve)));
    render(<PageChooser doc={{ ...full, budget: 5 }} aiOn pagesLeft={1} actions={actions} />);
    const three = screen.getByRole("checkbox", { name: /^p\. 3 / });
    await userEvent.click(three);
    expect(three).toBeChecked();
    expect(screen.getByText("3 of 5 allowed")).toBeInTheDocument();
    await act(async () => answer({ ok: false, code: "save-failed", message: "Could not save. Try again." }));
    expect(three).not.toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });

  it("asks before ticking past the limit, and only then raises it and ticks", async () => {
    const actions = actionsMock();
    render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^p\. 3 / }));
    const ask = screen.getByRole("group", { name: "Raise the page limit" });
    expect(ask).toHaveTextContent(/^Raise this document to 40 pages\? Ready by (?:\w{3} )?\d\d:\d\d\./);
    expect(actions.setPageSelected).not.toHaveBeenCalled();
    expect(mocks.setBudget).not.toHaveBeenCalled();

    await userEvent.click(within(ask).getByRole("button", { name: "Raise to 40 and tick page 3" }));
    expect(mocks.setBudget).toHaveBeenCalledWith(full.id, 40);
    await waitFor(() => expect(actions.setPageSelected).toHaveBeenCalledWith(full.id, 3, true));
    expect(mocks.setBudget.mock.invocationCallOrder[0]).toBeLessThan((actions.setPageSelected as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it("offers Re-read only on a page whose figures have been read", async () => {
    mocks.reread.mockResolvedValue({ ok: true, cost: { tokens: 3400, dayCap: 150000, text: "This uses about 3,400 of today's 150,000 AI tokens." } });
    const withRead = { ...full, pages: [page(3, { kind: "mdna" }), page(4, { kind: "pl", selected: true, by: "rule", read: true })] };
    render(<PageChooser doc={withRead} aiOn pagesLeft={0} actions={actionsMock()} />);
    // Mounted only while the list is open (a closed <details> does not render, and a transition on it would never finish).
    expect(screen.queryByRole("button", { name: /^Re-read page/, hidden: true })).toBeNull();
    await userEvent.click(screen.getByText("Pages to read"));
    expect(await screen.findAllByRole("button", { name: /^Re-read page/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Re-read page 4" }));
    expect(mocks.reread).toHaveBeenCalledWith(full.id, 4, false);
    expect(await screen.findByRole("group", { name: "Re-read page 4" })).toHaveTextContent("3,400");
  });

  it("declining the raise ticks nothing; at 40 there is nothing to raise", async () => {
    const actions = actionsMock();
    const { rerender } = render(<PageChooser doc={full} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^p\. 3 / }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("group", { name: "Raise the page limit" })).toBeNull();
    expect(actions.setPageSelected).not.toHaveBeenCalled();

    rerender(<PageChooser doc={{ ...full, budget: 40 }} aiOn pagesLeft={1} actions={actions} />);
    const many = Array.from({ length: 40 }, (_, i) => page(100 + i, { selected: true, kind: "notes" }));
    rerender(<PageChooser doc={{ ...full, budget: 40, pages: [...pages.slice(0, 1), ...many] }} aiOn pagesLeft={1} actions={actions} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^p\. 3 / }));
    expect(screen.getByRole("alert")).toHaveTextContent("This document is at 40 pages, the most the AI reads. Untick a page first.");
    expect(actions.setPageSelected).not.toHaveBeenCalled();
  });
});
