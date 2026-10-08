// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentListItem } from "@/modules/documents/client";
import { expectTokenOnly } from "@/test/ui";
import { ADD_SOURCE_EVENT, type AddSourceDetail } from "../add-source-event";
import type { CheckableFact } from "../facts-form/checkable";
import { DocPane } from "./doc-pane";
import { locatorPage } from "./locator-page";

const mocks = vi.hoisted(() => ({ read: vi.fn(), search: vi.fn(), check: vi.fn() }));
vi.mock("@/modules/documents/actions", () => ({ readPageAction: mocks.read, searchPagesAction: mocks.search, checkQuotesAction: mocks.check }));

const DOC: DocumentListItem = {
  id: "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e",
  title: "Annual report 2025-26",
  pageCount: 6,
  filedOn: "2026-07-12",
  sourceUrl: "https://example.com/ar.pdf",
  sourceType: "Annual report",
  originalDeletedAt: null,
};
const PAGES: Record<number, string> = {
  1: "Kaveri Fixtures Limited",
  4: "Consolidated Statement of Profit and Loss\nRevenue from operations 1,284.00 1,102.00",
};

beforeEach(() => {
  mocks.read.mockReset().mockImplementation(async (_id: string, n: number) => ({ ok: true, text: PAGES[n] ?? `text of page ${n}`, pageCount: 6, kind: n === 4 ? "pl" : null }));
  mocks.search.mockReset().mockResolvedValue([]);
  mocks.check.mockReset().mockResolvedValue([]);
});

function Harness({ facts = [], docs = [DOC], onUsed }: { facts?: CheckableFact[]; docs?: DocumentListItem[]; onUsed?: () => void }) {
  const [page, setPage] = useState(1);
  const [id, setId] = useState(docs[0].id);
  return <DocPane documents={docs} docId={id} onPick={setId} pageNo={page} onPage={setPage} facts={facts} onClose={() => {}} onUsed={onUsed} />;
}

describe("DocPane reading", () => {
  it("shows the document, reads page 1, and steps through pages with the stepper and the page box", async () => {
    const { container } = render(<Harness />);
    expect(screen.getByRole("heading", { name: DOC.title })).toBeInTheDocument();
    expect(screen.getByText(/Annual report · filed 12 Jul 2026 · 6 pages/)).toBeInTheDocument();
    expect(await screen.findByText("Kaveri Fixtures Limited")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenLastCalledWith(DOC.id, 1);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("text of page 2")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenLastCalledWith(DOC.id, 2);

    const box = screen.getByLabelText("Page");
    await userEvent.clear(box);
    await userEvent.type(box, "4{Enter}");
    expect(await screen.findByText(/Revenue from operations 1,284\.00 1,102\.00/)).toBeInTheDocument();
    expect(screen.getByText("P&L")).toBeInTheDocument();
    expect(screen.getByText("of 6")).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "99{Enter}");
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith(DOC.id, 6)); // clamped to the last page
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expectTokenOnly(container);
  });

  it("says the PDF was deleted once the document is done, and still reads the stored page text", async () => {
    render(<Harness docs={[{ ...DOC, originalDeletedAt: "2026-10-08T10:00:00Z" }]} />);
    expect(screen.getByText("The PDF was deleted; page text is still here.")).toBeInTheDocument();
    expect(await screen.findByText("Kaveri Fixtures Limited")).toBeInTheDocument();
  });

  it("keeps the page text out of a live region (only loading and errors are announced)", async () => {
    render(<Harness />);
    const text = await screen.findByText("Kaveri Fixtures Limited");
    expect(text.closest("[aria-live]")).toBeNull();
  });

  it("says so when a page cannot be read", async () => {
    mocks.read.mockResolvedValue({ ok: false, message: "That page is not in this document." });
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("That page is not in this document.");
  });

  it("lists the document's pages when there are several, and reads the one picked", async () => {
    const other = { ...DOC, id: "1c7a4d2f-9b3e-4a6c-8d8f-2e3b4c5d6e7f", title: "Investor deck Q1" };
    render(<Harness docs={[DOC, other]} />);
    await screen.findByText("Kaveri Fixtures Limited");
    await userEvent.selectOptions(screen.getByLabelText("Document"), other.id);
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith(other.id, 1));
    expect(screen.getByRole("heading", { name: "Investor deck Q1" })).toBeInTheDocument();
  });
});

describe("DocPane search", () => {
  it("lists the pages with a line around the hit, and a tap opens that page with the words marked", async () => {
    mocks.search.mockResolvedValue([{ pageNo: 4, snippet: "...Revenue from operations 1,284.00 1,102.00" }]);
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Search this document"), "revenue operations{Enter}");
    expect(mocks.search).toHaveBeenCalledWith(DOC.id, "revenue operations");
    const hit = await screen.findByRole("button", { name: /^p\. 4/ });
    expect(hit).toHaveTextContent("Revenue from operations 1,284.00");
    await userEvent.click(hit);
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith(DOC.id, 4));
    const marked = await screen.findAllByText(/^(Revenue|operations)$/i, { selector: "mark" });
    expect(marked).toHaveLength(2);
  });

  it("says when no page has the words", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Search this document"), "nothing{Enter}");
    expect(await screen.findByText("No page has all of those words.")).toBeInTheDocument();
  });
});

describe("DocPane use as source", () => {
  it("sends the document's title, type, filed-on date and link, and writes nothing itself", async () => {
    const heard: AddSourceDetail[] = [];
    const listen = (e: Event) => {
      heard.push((e as CustomEvent<AddSourceDetail>).detail);
      e.preventDefault(); // the Facts form took it
    };
    window.addEventListener(ADD_SOURCE_EVENT, listen);
    const onUsed = vi.fn();
    render(<Harness onUsed={onUsed} />);
    await screen.findByText("Kaveri Fixtures Limited");
    await userEvent.click(screen.getByRole("button", { name: "Use as source" }));
    window.removeEventListener(ADD_SOURCE_EVENT, listen);
    expect(heard).toEqual([{ doc: DOC.title, type: "Annual report", filedOn: "2026-07-12", url: "https://example.com/ar.pdf" }]);
    expect(onUsed).toHaveBeenCalledTimes(1);
    expect(screen.getByText("It is in the Sources list.")).toBeInTheDocument();
  });

  it("says nothing is in the Sources list, and does not close the sheet, when no form took the source", async () => {
    const onUsed = vi.fn();
    render(<Harness onUsed={onUsed} />);
    await userEvent.click(screen.getByRole("button", { name: "Use as source" }));
    expect(screen.queryByText("It is in the Sources list.")).not.toBeInTheDocument();
    expect(onUsed).not.toHaveBeenCalled();
  });

  it("sends empty strings for a document with no date or link", async () => {
    let heard: AddSourceDetail | null = null;
    const listen = (e: Event) => (heard = (e as CustomEvent<AddSourceDetail>).detail);
    window.addEventListener(ADD_SOURCE_EVENT, listen);
    render(<Harness docs={[{ ...DOC, filedOn: null, sourceUrl: null }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Use as source" }));
    window.removeEventListener(ADD_SOURCE_EVENT, listen);
    expect(heard).toEqual({ doc: DOC.title, type: "Annual report", filedOn: "", url: "" });
  });
});

describe("DocPane check my quotes", () => {
  const fact = (id: string, over: Partial<CheckableFact>): CheckableFact => ({ id, label: "Metric", doc: DOC.title, locator: "p. 4", quote: "x", value: "1", ...over });

  it("reports each quote against the page its fact cites, and the value against the figures there", async () => {
    mocks.check.mockResolvedValue([
      { factId: "F1", quoteFound: true, valueFound: true },
      { factId: "F2", quoteFound: false, valueFound: false },
    ]);
    const facts = [
      fact("F1", { label: "Revenue from operations", quote: "Revenue from operations 1,284.00 1,102.00", value: "1284" }),
      fact("F2", { label: "Finance costs", quote: "Finance costs 41.70", value: "41.7" }),
      fact("F3", { label: "No quote", quote: "" }),
      fact("F4", { label: "Other document", doc: "Investor deck", quote: "something" }),
    ];
    render(<Harness facts={facts} />);
    await userEvent.click(screen.getByRole("button", { name: "Check my quotes" }));
    expect(mocks.check).toHaveBeenCalledWith(DOC.id, [
      { factId: "F1", pageNo: 4, quote: "Revenue from operations 1,284.00 1,102.00", valueText: "1284" },
      { factId: "F2", pageNo: 4, quote: "Finance costs 41.70", valueText: "41.7" },
    ]);
    const f1 = (await screen.findByText("Revenue from operations")).closest("li") as HTMLElement;
    expect(within(f1).getByText("found on p. 4")).toBeInTheDocument();
    expect(within(f1).getByText("value printed there")).toBeInTheDocument();
    const f2 = screen.getByText("Finance costs").closest("li") as HTMLElement;
    expect(within(f2).getByText("not on p. 4")).toBeInTheDocument();
    expect(within(f2).getByText("value not printed there")).toBeInTheDocument();
    expect(screen.queryByText("No quote")).not.toBeInTheDocument();
    expect(screen.queryByText("Other document")).not.toBeInTheDocument();
  });

  it("uses the open page when the fact's locator names none, and the title match ignores case and spacing", async () => {
    mocks.check.mockResolvedValue([{ factId: "F1", quoteFound: true, valueFound: true }]);
    render(<Harness facts={[fact("F1", { doc: "  annual  REPORT 2025-26", locator: "", quote: "q" })]} />);
    await screen.findByText("Kaveri Fixtures Limited");
    await userEvent.click(screen.getByRole("button", { name: "Check my quotes" }));
    expect(mocks.check).toHaveBeenCalledWith(DOC.id, [{ factId: "F1", pageNo: 1, quote: "q", valueText: "1" }]);
    expect(await screen.findByText("found on p. 1")).toBeInTheDocument();
  });

  it("says what to do when no fact cites this document with a quote, without asking the server", async () => {
    render(<Harness facts={[fact("F1", { quote: "" })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Check my quotes" }));
    expect(await screen.findByText(/No fact cites this document with a quoted line yet/)).toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("says the check could not run when the server gave no answer", async () => {
    render(<Harness facts={[fact("F1", { quote: "q" })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Check my quotes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The check could not run. Try again.");
  });

  it("opens the cited page from a result", async () => {
    mocks.check.mockResolvedValue([{ factId: "F1", quoteFound: false, valueFound: false }]);
    render(<Harness facts={[fact("F1", { quote: "q", locator: "page 4" })]} />);
    await userEvent.click(screen.getByRole("button", { name: "Check my quotes" }));
    await act(async () => userEvent.click(await screen.findByRole("button", { name: "Open p. 4" })));
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith(DOC.id, 4));
  });
});

describe("locatorPage", () => {
  it("reads the page a locator names", () => {
    expect(locatorPage("p. 131")).toBe(131);
    expect(locatorPage("pp. 4-5")).toBe(4);
    expect(locatorPage("Page 4")).toBe(4);
    expect(locatorPage("4")).toBe(4);
    expect(locatorPage("Note 12")).toBeNull();
    expect(locatorPage("")).toBeNull();
    expect(locatorPage("p. 0")).toBeNull();
  });
});
