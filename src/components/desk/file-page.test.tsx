// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildFileView, type PublicSnapshot } from "@/modules/showcase";
import { buildFiguresAfterDataAsOfSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { FileHeader } from "./file-header";
import { FileSections, testsSub } from "./file-sections";

function renderFile(snapshot: PublicSnapshot = buildSeedSnapshot()) {
  mockMatchMedia();
  mockIntersectionObserver();
  const file = buildFileView(snapshot, "kavpump")!;
  return renderWithMotion(
    <>
      <FileHeader file={file} />
      <FileSections file={file} />
    </>,
  );
}

describe("the B+ file page", () => {
  it("is numbered and dated: FILE tag, the company as h1, the title, what it teaches, the dateline", () => {
    renderFile();
    expect(screen.getByText("FILE 01 · R2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Kaveri Pumps (fictional)" })).toBeInTheDocument();
    expect(screen.getByText("Kaveri Pumps: does pricing power survive slower dealer payments")).toBeInTheDocument();
    expect(screen.getByText(/Learn to read receivable days next to margins/)).toBeInTheDocument();
    expect(screen.getByText("R2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How to read receivable days" })).toHaveAttribute("href", "/notes/how-to-read-receivable-days");
  });

  it("keeps Aksh's words and the sourced facts in separate labelled blocks (R1 row 3)", () => {
    const { container } = renderFile();
    const view = screen.getByRole("region", { name: "Aksh's view" });
    const facts = screen.getByRole("region", { name: /Source facts/ });
    expect(within(view).getByText(/I read that as some pricing power/)).toBeInTheDocument();
    expect(facts).not.toHaveTextContent("I read that as some pricing power");
    expect(within(facts).getByText("Revenue from operations")).toBeInTheDocument();
    expect(screen.getByText('Three tests Aksh set himself. "Met" means his view is wrong.')).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Disclosure" })).toHaveTextContent("Position in the security discussed: No.");
    expect(screen.getByRole("region", { name: "Revisions" })).toHaveTextContent("Receivable days rose again in FY26; added a test on the dealer count.");
    expectTokenOnly(container);
  });

  it("never puts a sourced figure younger than 30 days into the facts block (rule 3, D26)", () => {
    // files() only yields a lagged file, so a figure younger than 30 days can reach a page only past the gate's rule 3a;
    // this fixture models that impossible revision (today 15 Apr 2026, FY26 facts of 31 Mar 2026).
    renderFile(buildFiguresAfterDataAsOfSnapshot());
    // Aksh's prose is covered by the item-level lag in SQL (public_items hides data_as_of within 30 days);
    // per-figure withholding protects the FACTS block, the chips and the exhibits.
    const facts = screen.getByRole("region", { name: /Source facts/ });
    expect(facts).not.toHaveTextContent("1,284");
    expect(within(facts).getAllByText("[withheld until 30 Apr 2026]").length).toBeGreaterThan(0);
  });

  it("words small test counts at the start of the sentence (design-dna 13.1)", () => {
    expect(testsSub(1)).toBe('One test Aksh set himself. "Met" means his view is wrong.');
    expect(testsSub(12)).toBe('12 tests Aksh set himself. "Met" means his view is wrong.');
  });
});
