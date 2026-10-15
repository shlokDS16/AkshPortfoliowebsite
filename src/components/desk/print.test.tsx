// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRINT_BANNER_TEXT, PrintBanner } from "./private/print-banner";
import { PrintButton } from "./print-button";
import { PrintDisclosure } from "./print-disclosure";
import { PrintMasthead } from "./print-masthead";
import { derivedProblems } from "@/modules/showcase";
import { expectTokenOnly } from "@/test/ui";
import type { HoldsPosition } from "@/lib/desk-types";

// Plan 5a Task 3, spec s5 and publishing rule 11.4. The print-only blocks are in the page's markup (a printer reads the same document
// the screen does) and shown by `print:block`; the button is `print:hidden`.

describe("PrintMasthead", () => {
  const props = { address: "https://desk.example/companies/kavpump", revNo: 2, revisedOn: "2026-10-05", figuresTo: "2026-08-31" };

  it("names the site, gives the address and says which revision this copy is, with its dates", () => {
    const { container } = render(<PrintMasthead {...props} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Aksh Agrawal · Case files");
    expect(text).toContain("https://desk.example/companies/kavpump");
    expect(text).toContain("This copy shows revision R2 of 5 Oct 2026. Figures to 31 Aug 2026. The current version is at the address above.");
    expect(container.firstElementChild?.className).toMatch(/\bhidden\b/);
    expect(container.firstElementChild?.className).toMatch(/print:block/);
    expectTokenOnly(container);
  });

  it("a note has no figures-to part", () => {
    const { container } = render(<PrintMasthead {...props} figuresTo={null} />);
    expect(container.textContent).toContain("This copy shows revision R2 of 5 Oct 2026. The current version is at the address above.");
    expect(container.textContent).not.toContain("Figures to");
  });

  it("prints no id and no figure of its own", () => {
    const { container } = render(<PrintMasthead {...props} />);
    // The dates carry digits and the address a slug; nothing else may. A "%" or an Rs figure would be a builder's addition.
    expect(derivedProblems(container.textContent ?? "")).toEqual([]);
  });
});

describe("PrintDisclosure", () => {
  it.each<[HoldsPosition | null, string]>([
    ["yes", "Position in the security discussed: Yes."],
    ["no", "Position in the security discussed: No."],
    ["not_disclosed", "Position in the security discussed: Not disclosed."],
    [null, "Position in the security discussed: Not disclosed."],
  ])("carries the standard disclosure in full for holds_position %s", (holdsPosition, line) => {
    const { container } = render(<PrintDisclosure holdsPosition={holdsPosition} reviewedOn="2026-10-05" />);
    expect(screen.getByRole("heading", { name: "Disclosure", hidden: true })).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).toContain("Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser.");
    expect(text).toContain("Figures are shown with a minimum 30-day lag.");
    expect(text).toContain(line);
    expect(text).toContain("Last reviewed 5 Oct 2026.");
    expect(container.firstElementChild?.className).toMatch(/\bhidden\b/);
    expect(container.firstElementChild?.className).toMatch(/print:block/);
    expect(container.firstElementChild).toHaveAttribute("data-lint-exclude");
  });
});

describe("PrintButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is a plain button that opens the browser's print dialog and is hidden in print", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<PrintButton />);
    const button = screen.getByRole("button", { name: "Save as PDF" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toMatch(/print:hidden/);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe("PrintBanner", () => {
  it("is the private-copy sentence, shown only in print", () => {
    const { container } = render(<PrintBanner />);
    expect(container.textContent).toBe(PRINT_BANNER_TEXT);
    expect(PRINT_BANNER_TEXT).toBe("Private desk copy. Not for sharing: it has not passed the publish gate and may show figures less than 30 days old.");
    expect(container.firstElementChild?.className).toMatch(/\bhidden\b/);
    expect(container.firstElementChild?.className).toMatch(/print:block/);
    expect(container.firstElementChild).toHaveAttribute("data-print-banner");
  });
});
