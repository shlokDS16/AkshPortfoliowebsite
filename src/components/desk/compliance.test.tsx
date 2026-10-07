// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DATELINE } from "@/test/fixtures/desk-ui";
import { expectNoMotion, expectTokenOnly, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { AsOf, Withheld } from "./as-of";
import { ComplianceStrip } from "./compliance-strip";
import { Dateline } from "./dateline";
import { Disclosure } from "./disclosure";
import { SiteDisclosureLine } from "./site-disclosure-line";

describe("ComplianceStrip", () => {
  it("file variant: position and figures-to date from data; Details opens the drawer", async () => {
    mockMatchMedia();
    renderWithMotion(<ComplianceStrip variant="file" holdsPosition="no" dataAsOf="2026-06-30" />);
    const strip = screen.getByRole("complementary", { name: "Disclosure summary" });
    expect(strip).toHaveTextContent("For learning · Aksh holds no position · Figures to 30 Jun 2026");
    expect(strip).toHaveAttribute("data-lint-exclude");
    const details = screen.getByRole("button", { name: "Details" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/A case study Aksh wrote to learn how this business works/)).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>("[data-strip-drawer]")?.style.clipPath).toContain("inset");
    expectTokenOnly(strip);
  });

  it("a null position renders 'Position not disclosed'; site variant uses the site copy", async () => {
    mockMatchMedia();
    const { rerender } = renderWithMotion(<ComplianceStrip variant="file" holdsPosition={null} dataAsOf="2026-06-30" />);
    expect(screen.getByRole("complementary")).toHaveTextContent("Position not disclosed");
    rerender(<ComplianceStrip variant="site" />);
    expect(screen.getByRole("complementary")).toHaveTextContent("For learning · Aksh is not SEBI-registered · Figures 30+ days old");
  });

  it("reduced motion: the drawer fades instead of clipping and sliding", async () => {
    mockMatchMedia({ reducedMotion: true });
    renderWithMotion(<ComplianceStrip variant="site" />, { reducedMotion: true });
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    const drawer = document.querySelector<HTMLElement>("[data-strip-drawer]");
    expect(drawer?.style.clipPath ?? "").toBe("");
  });
});

describe("Disclosure", () => {
  it("renders the standard disclosure verbatim with the position word and review date", () => {
    const { container } = render(<Disclosure holdsPosition="not_disclosed" reviewedOn="2026-08-20" />);
    const block = screen.getByRole("region", { name: "Disclosure" });
    expect(block).toHaveAttribute("id", "disclosure");
    expect(block).toHaveTextContent(
      "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: Not disclosed. Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed 20 Aug 2026.",
    );
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("dating", () => {
  it("Dateline shows version, revised, first written and figures-to", () => {
    const { container } = render(<Dateline {...DATELINE} />);
    expect(screen.getByText("R2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Figures to").nextSibling).toHaveTextContent("30 Jun 2026");
    expectNoMotion(container);
  });

  it("AsOf and Withheld print rule-3 text", () => {
    render(
      <p>
        <AsOf date="2026-06-30" /> <Withheld availableOn="2026-11-12" />
      </p>,
    );
    expect(screen.getByText("Figures to 30 Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("[withheld until 12 Nov 2026]")).toHaveClass("withheld");
  });

  it("the phone site line links to the disclosures", () => {
    render(<SiteDisclosureLine />);
    expect(screen.getByRole("link", { name: "Disclosures" })).toHaveAttribute("href", "/about#disclosures");
  });
});
