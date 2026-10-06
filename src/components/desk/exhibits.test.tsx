// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChartPoint } from "@/lib/view-types";
import { EXHIBIT, SCENARIO } from "@/test/fixtures/desk-ui";
import { expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { LineChart } from "./chart/line-chart";
import { Exhibit } from "./exhibit";
import { LedgerTable } from "./ledger-table";
import { ScenarioTable } from "./scenario-table";

const withhold = (p: ChartPoint): ChartPoint => ({ x: p.x, y: null, withheld: true, withheldUntil: "2026-07-30" });
const withFY26Withheld = {
  ...EXHIBIT.chart,
  series: [{ ...EXHIBIT.chart.series[0], points: EXHIBIT.chart.series[0].points.map((p, i) => (i === 4 ? withhold(p) : p)) }],
};

describe("Exhibit", () => {
  it("frames every figure: geru top rule and number, factual title, Chart/Table toggle, source and data-to footer", async () => {
    mockMatchMedia();
    mockIntersectionObserver();
    const { container } = renderWithMotion(<Exhibit data={EXHIBIT} />);
    const figure = screen.getByRole("figure");
    expect(figure).toHaveClass("border-t-2", "border-geru");
    expect(within(figure).getByText("Ex. 01.1")).toHaveClass("text-geru");
    expect(within(figure).getByRole("img", { name: EXHIBIT.chart.summary })).toBeInTheDocument();
    expect(within(figure).getByText("Data to").nextSibling).toHaveTextContent("31 Mar 2026");
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    // The ledger renders a desk table and a phone table; CSS (hidden / desk:hidden) leaves one in the accessibility tree.
    expect(within(figure).getAllByRole("table")).toHaveLength(2);
    expect(container.querySelector("svg .stroke-geru, svg .fill-geru")).toBeNull();
    expectTokenOnly(container);
  });

  it("falls back to the table with a reason when the chart has nothing to draw", () => {
    mockMatchMedia();
    const empty = { ...EXHIBIT, chart: { ...EXHIBIT.chart, series: [] } };
    renderWithMotion(<Exhibit data={empty} />);
    expect(screen.getByText("Chart could not be drawn. The table holds the same figures.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Table" })).toHaveAttribute("aria-checked", "true");
  });

  it("omits the Chart option when there is nothing to draw", () => {
    mockMatchMedia();
    renderWithMotion(<Exhibit data={{ ...EXHIBIT, chart: { ...EXHIBIT.chart, series: [] } }} />);
    expect(screen.queryByRole("radio", { name: "Chart" })).toBeNull();
  });

  it("names each figure from its own identity so two exhibits on a page never share an id", () => {
    mockMatchMedia();
    renderWithMotion(
      <>
        <Exhibit data={EXHIBIT} />
        <Exhibit data={{ ...EXHIBIT, n: 2, title: "Second exhibit" }} />
      </>,
    );
    expect(screen.getByRole("figure", { name: EXHIBIT.title })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Second exhibit" })).toBeInTheDocument();
  });

  it("says so in the footer, without throwing, when no figure is old enough (dataTo null)", () => {
    mockMatchMedia();
    renderWithMotion(<Exhibit data={{ ...EXHIBIT, dataTo: null }} />);
    expect(screen.getByText("Data to").nextSibling).toHaveTextContent("No figure old enough yet");
  });
  it("falls back to the table when the only real points are withheld", () => {
    mockMatchMedia();
    const allWithheld = {
      ...EXHIBIT,
      chart: { ...EXHIBIT.chart, series: [{ ...EXHIBIT.chart.series[0], points: EXHIBIT.chart.series[0].points.map(withhold) }] },
    };
    renderWithMotion(<Exhibit data={allWithheld} />);
    expect(screen.getByRole("radio", { name: "Table" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("LineChart", () => {
  it("draws ink subject, dashed neel threshold with a direct label, and the data cap", () => {
    mockMatchMedia();
    const { container } = render(<LineChart data={EXHIBIT.chart} height={{ phone: 200, desk: 240 }} />);
    expect(container.querySelector(".chart-subject")).toHaveClass("stroke-ink");
    expect(container.querySelector(".chart-subject")).toHaveAttribute("pathLength", "1");
    expect(container.querySelector("[data-threshold] line")).toHaveAttribute("stroke-dasharray", "5 4");
    expect(screen.getByText("Test 1 line: 150 days")).toHaveClass("fill-neel");
    expect(screen.getByText("Data to 31 Mar 2026")).toHaveClass("cap-label");
    expect(container.querySelector(".chart")).not.toHaveAttribute("data-draw");
    expectTokenOnly(container);
  });

  it("arms the draw only for a chart below the fold, then runs it when it enters view", () => {
    mockMatchMedia();
    const io = mockIntersectionObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2240, height: 240 } as DOMRect);
    const { container } = render(<LineChart data={EXHIBIT.chart} height={{ phone: 200, desk: 240 }} />);
    const chart = container.querySelector<HTMLElement>(".chart")!;
    expect(chart).toHaveAttribute("data-draw", "armed");
    act(() => io.trigger(chart, true));
    expect(chart).toHaveAttribute("data-draw", "run");
  });

  it("reduced motion: drawn at once", () => {
    mockMatchMedia({ reducedMotion: true });
    mockIntersectionObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2240, height: 240 } as DOMRect);
    const { container } = render(<LineChart data={EXHIBIT.chart} height={{ phone: 200, desk: 240 }} />);
    expect(container.querySelector(".chart")).not.toHaveAttribute("data-draw");
  });

  it("reads values with the arrow keys", async () => {
    mockMatchMedia();
    render(<LineChart data={EXHIBIT.chart} height={{ phone: 200, desk: 240 }} />);
    const group = screen.getByRole("group", { name: /use the arrow keys/ });
    group.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("FY22: 81 days")).toBeInTheDocument();
    await userEvent.keyboard("{End}");
    expect(screen.getByText("FY26: 142 days")).toBeInTheDocument();
  });

  it("rule 3: a withheld point shows no figure in any label, aria-label, title, the readout or the path, only the hatch", async () => {
    mockMatchMedia();
    const { container } = render(<LineChart data={withFY26Withheld} height={{ phone: 200, desk: 240 }} />);
    expect(container.textContent).not.toContain("142");
    for (const el of container.querySelectorAll("[aria-label], [title]")) {
      expect(el.getAttribute("aria-label") ?? "").not.toContain("142");
      expect(el.getAttribute("title") ?? "").not.toContain("142");
    }
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "Receivable days: some values withheld until 30 Jul 2026");
    expect(screen.getByText("withheld")).toBeInTheDocument();
    screen.getByRole("group", { name: /use the arrow keys/ }).focus();
    await userEvent.keyboard("{End}");
    expect(screen.getByText("FY25: 131 days")).toBeInTheDocument();
    expect(screen.queryByText(/FY26: /)).toBeNull();
  });

  it("keeps the author's finding as the accessible name when nothing is withheld", () => {
    mockMatchMedia();
    render(<LineChart data={EXHIBIT.chart} height={{ phone: 200, desk: 240 }} />);
    expect(screen.getByRole("img", { name: EXHIBIT.chart.summary })).toBeInTheDocument();
  });
});

describe("LedgerTable and ScenarioTable", () => {
  it("ledger: year end and source per column, shaded current column, sticky key row on phone", () => {
    const { container } = render(<LedgerTable periods={EXHIBIT.ledger.periods} rows={EXHIBIT.ledger.rows} />);
    expect(screen.getAllByText("31 Mar 2026").length).toBeGreaterThan(0);
    const key = container.querySelector("[data-key-row]")!;
    expect(key.tagName).toBe("THEAD");
    expect(key).toHaveClass("sticky", "bg-paper", "z-(--z-sticky-key)");
    expect(key.className).toContain("top-[calc(var(--top-bar-h)+var(--index-h))]");
    // A sticky row sticks only if no ancestor inside the component clips or scrolls.
    for (let el: Element | null = key.parentElement; el; el = el.parentElement) expect(el.className).not.toMatch(/overflow/);
    expect(container.querySelector("[data-current]")).toHaveClass("bg-surface");
    expectTokenOnly(container);
  });

  it("ledger rule 3: a withheld cell renders the marker and never its figure, in either layout", () => {
    const rows = [{ ...EXHIBIT.ledger.rows[0], withheld: EXHIBIT.ledger.rows[0].withheld.map((w, i) => (i === 4 ? "2026-07-30" : w)) }];
    const { container } = render(<LedgerTable periods={EXHIBIT.ledger.periods} rows={rows} />);
    expect(container.querySelectorAll(".withheld")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/\b142\b/);
    expect(container.querySelector('[aria-label*="142"], [title*="142"]')).toBeNull();
  });

  it("scenario: operating outputs only, frozen with the revision and dated", () => {
    render(<ScenarioTable data={SCENARIO} />);
    expect(screen.getByRole("columnheader", { name: "Base" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "FY28 revenue" })).toBeInTheDocument();
    expect(screen.getByText(/Frozen with R2 · figures to 30 Jun 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/per share|equity value|target price/i)).toBeNull();
  });

  it("scenario: no scenarios gives an explained empty state", () => {
    render(<ScenarioTable data={null} />);
    expect(screen.getByText(/No scenarios in this file/)).toBeInTheDocument();
  });
});
