// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InboxDoc } from "@/modules/ingestion/client";
import { actionsMock, doc, view } from "@/test/inbox-fixtures";
import { DocumentCard } from "./document-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/ingestion/actions", () => ({ skipStepAction: vi.fn(), retryStepAction: vi.fn(), skipDocumentAction: vi.fn() }));

// Plan 2.7 Task 3: a valuation workbook's card. It has no figures to review and no pages to enter by hand, so its actions are its own.
const VERSION = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const book = (over: Partial<InboxDoc> & { view: InboxDoc["view"] }) => doc({ title: "Kaveri DCF", kind: "xlsx", pageCount: null, company: "KAVPUMP", ...over });

describe("DocumentCard for a valuation workbook", () => {
  it("once read, links to its model page and says it is a workbook", () => {
    render(<DocumentCard doc={book({ model: { versionId: VERSION, status: "ready" }, view: view("ready", "Model read: 3 sheets, 60 cells, 30 formulas. Choose its inputs and results.") })} aiOn actions={actionsMock()} />);
    expect(screen.getByRole("link", { name: "Open model" })).toHaveAttribute("href", `/desk/models/${VERSION}`);
    expect(screen.getByText(/Excel workbook/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("refused: offers a fixed upload and Skip, never Try again or Enter manually", () => {
    render(<DocumentCard doc={book({ model: { versionId: VERSION, status: "refused" }, view: view("attention", "This workbook has macros.") })} aiOn actions={actionsMock()} />);
    expect(screen.getByRole("link", { name: "Upload a fixed workbook" })).toHaveAttribute("href", "/desk/inbox#upload");
    expect(screen.getByRole("button", { name: "Skip this document" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Enter manually" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open model" })).toBeNull();
  });

  it("a read that stopped (the version still says reading): Try again and Skip", () => {
    render(<DocumentCard doc={book({ model: { versionId: VERSION, status: "reading" }, view: view("attention", "This workbook is too large to read in one go.") })} aiOn actions={actionsMock()} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip this document" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Enter manually" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("a PDF in Needs attention keeps Enter manually, Skip and Try again", () => {
    render(<DocumentCard doc={doc({ view: view("attention", "Page 4 could not be read.") })} aiOn actions={actionsMock()} />);
    expect(screen.getByRole("link", { name: "Enter manually" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
