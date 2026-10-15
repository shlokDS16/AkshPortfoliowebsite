// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RevisionEditor } from "./revision-editor";

const ledger = (props: Partial<Parameters<typeof RevisionEditor>[0]> = {}) =>
  render(<RevisionEditor action={vi.fn()} bodyMd="" sheet={null} ledgerCase {...props} />);

describe("the revision editor for a case study from the ledger (D41)", () => {
  it("offers the body and the change reason, and no facts editor of any kind", () => {
    ledger();
    expect(screen.getByLabelText("Body (Markdown)")).toHaveValue("");
    expect(screen.getByLabelText("Change reason")).toBeInTheDocument();
    expect(screen.queryByText("Facts")).toBeNull();
    expect(screen.queryByLabelText("Facts sheet")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Text sheet" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Form" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save revision" })).toBeEnabled();
  });

  it("explains what the body is for, in place of the company-file help", () => {
    ledger();
    expect(screen.getByText("Your words, shown under \"Looking back\" on the page. The entries from the ledger are not edited here.")).toBeInTheDocument();
    expect(screen.queryByText(/prove me wrong/)).toBeNull();
    expect(screen.queryByText(/For a company file/)).toBeNull();
  });

  it("a company file keeps its own help text", () => {
    render(<RevisionEditor action={vi.fn()} bodyMd="A note." sheet={null} />);
    expect(screen.getByText(/For a company file/)).toBeInTheDocument();
    expect(screen.queryByText(/Looking back/)).toBeNull();
  });

  it("says nothing about moving Figures to in the public notice (the ledger sets it; the item screen explains a frozen date)", () => {
    ledger({ isPublic: true });
    expect(screen.getByText(/This item is public\. A new revision is stored at once but stays hidden until it passes the publishing gate\./)).toBeInTheDocument();
    expect(screen.queryByText(/Figures to cannot move/)).toBeNull();
  });
});
