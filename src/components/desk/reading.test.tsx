// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FACT_GROUPS, READ_FIRST, SOURCES, USED_IN, VIEW_BLOCKS } from "@/test/fixtures/desk-ui";
import { expectNoMotion, expectTokenOnly, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { BlockHeader } from "./block-header";
import { FactTable } from "./fact-table";
import { ReadFirst } from "./read-first";
import { SourceList } from "./source-list";
import { UsedIn } from "./used-in";
import { ViewBlock } from "./view-block";

describe("BlockHeader", () => {
  it("separates facts from view by label style: VIEW geru fill, FACTS dashed outline", () => {
    const { container } = render(
      <div>
        <BlockHeader label="VIEW" title="Aksh's view" sub="His own words. Each figure opens the line it came from." id="view" />
        <BlockHeader label="FACTS" title="Source facts" id="facts" count={4} />
      </div>,
    );
    expect(screen.getByText("VIEW")).toHaveClass("bg-geru", "text-on-geru");
    expect(screen.getByText("FACTS")).toHaveClass("border-dashed");
    expect(screen.getByRole("heading", { level: 2, name: /Source facts/ })).toHaveAttribute("id", "facts");
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("ViewBlock", () => {
  it("renders Aksh's prose at reading size with a chip that opens its source card in flow", async () => {
    mockMatchMedia();
    renderWithMotion(<ViewBlock blocks={VIEW_BLOCKS} />);
    const chip = screen.getByRole("button", { name: "S1 p. 131" });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    const card = screen.getByRole("region", { name: "Source for ₹1,284 cr" });
    expect(card).toHaveTextContent("₹1,284 cr");
    expect(card).toHaveTextContent("FY25: ₹1,102 cr");
    expect(card).toHaveTextContent("“Revenue from operations rose to ₹1,284 crore.”");
    expect(card).toHaveTextContent("as of 31 Mar 2026");
    expect((card.parentElement as HTMLElement).style.clipPath).toContain("inset");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "false");
  });

  it("prose never animates; under reduced motion the card only fades", async () => {
    mockMatchMedia({ reducedMotion: true });
    const { container } = renderWithMotion(<ViewBlock blocks={VIEW_BLOCKS} />, { reducedMotion: true });
    expectNoMotion(container.querySelector(".prose-read")!);
    await userEvent.click(screen.getByRole("button", { name: "S1 p. 131" }));
    expect((screen.getByRole("region").parentElement as HTMLElement).style.clipPath ?? "").toBe("");
    expectTokenOnly(container);
  });

  it("explains an empty view", () => {
    render(<ViewBlock blocks={[]} />);
    expect(screen.getByText(/No view written yet/)).toBeInTheDocument();
  });
});

describe("FactTable and SourceList", () => {
  it("states as-of once per group, keeps a units column, and withholds young figures (rule 3)", () => {
    const { container } = render(<FactTable groups={FACT_GROUPS} />);
    expect(screen.getByText("as of 31 Mar 2026")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1,284" })).toHaveClass("tabular-nums", "text-right");
    expect(screen.getByText("[withheld until 25 Oct 2026]")).toBeInTheDocument();
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("lists sources with type and filing date, and explains an empty list", () => {
    const { rerender } = render(<SourceList sources={SOURCES} />);
    expect(screen.getByText(/Annual report ·/)).toBeInTheDocument();
    expect(screen.getByText(/filed 12 Jul 2026/)).toBeInTheDocument();
    rerender(<SourceList sources={[]} />);
    expect(screen.getByText(/No sources listed yet/)).toBeInTheDocument();
  });

  it("explains an empty fact table with its column shape", () => {
    render(<FactTable groups={[]} />);
    expect(screen.getByText(/Metric · Value · Unit · Prior · Source/)).toBeInTheDocument();
  });
});

describe("ReadFirst and UsedIn", () => {
  it("one note is one line; none renders nothing", () => {
    const { container, rerender } = render(<ReadFirst notes={READ_FIRST} />);
    expect(screen.getByText(/Read first:/)).toHaveTextContent("Read first: How to read an order book · 6 min");
    rerender(<ReadFirst notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("UsedIn lists public files that rely on the note", () => {
    const { rerender } = render(<UsedIn uses={USED_IN} />);
    expect(screen.getByRole("link", { name: "Kaveri Pumps (fictional)" })).toHaveAttribute("href", "/companies/kavpump");
    expect(screen.getByRole("cell", { name: "5 Aug 2026" })).toBeInTheDocument();
    rerender(<UsedIn uses={[]} />);
    expect(screen.getByText(/Not used in a file yet/)).toBeInTheDocument();
  });
});
