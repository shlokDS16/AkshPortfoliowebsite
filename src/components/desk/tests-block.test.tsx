// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KILL_TESTS } from "@/test/fixtures/desk-ui";
import { expectTokenOnly, mockIntersectionObserver, mockMatchMedia } from "@/test/ui";
import { KillCriteriaTable } from "./kill-criteria-table";
import { ThresholdMeter } from "./threshold-meter";

describe("KillCriteriaTable", () => {
  it("summarises statuses in fixed order and states that Met means the view is wrong", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    const { container } = render(<KillCriteriaTable tests={KILL_TESTS} />);
    expect(screen.getByLabelText("0 met, 1 watching, 1 not met, 1 no data")).toBeInTheDocument();
    expect(screen.getByText(/"Met" means his view is wrong/)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("T1")).toHaveClass("text-ink-muted");
    expect(within(rows[0]).getByText("Watching")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Data to 31 Mar 2026")).toBeInTheDocument();
    expect(within(rows[2]).getAllByText("Not disclosed yet").length).toBeGreaterThan(0);
    expectTokenOnly(container);
  });

  it("status glyphs carry the tick hook; the words never move", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    const { container } = render(<KillCriteriaTable tests={KILL_TESTS} />);
    const ticks = container.querySelectorAll("tbody .status-tick");
    expect(ticks).toHaveLength(3);
    expect(ticks[2].getAttribute("style")).toContain("--i: 2");
    expect(screen.getAllByText("Watching")[0].className).not.toMatch(/animate|tick/);
  });

  it("reduced motion never arms the tick", () => {
    mockMatchMedia({ reducedMotion: true });
    const io = mockIntersectionObserver();
    const { container } = render(<KillCriteriaTable tests={KILL_TESTS} />);
    io.trigger(container.firstElementChild!, true);
    expect(container.querySelector("[data-tick]")).toBeNull();
  });

  it("explains an empty test list", () => {
    render(<KillCriteriaTable tests={[]} />);
    expect(screen.getByText(/No tests yet/)).toBeInTheDocument();
  });
});

describe("ThresholdMeter", () => {
  it("places threshold, current and prior along the scale, labels the threshold in neel", () => {
    const meter = KILL_TESTS[0].meter!;
    const { container } = render(<ThresholdMeter meter={meter} />);
    expect(screen.getByRole("img", { name: "Test 1 line: 150 days; current 142 days" })).toBeInTheDocument();
    expect(container.querySelector("[data-mark='threshold']")?.getAttribute("style")).toContain("left: 64.29%");
    expect(container.querySelector("[data-mark='current']")?.getAttribute("style")).toContain("left: 58.57%");
    expect(container.querySelector("[data-mark='met-zone']")?.getAttribute("style")).toContain("left: 64.29%");
    expect(screen.getByText("Test 1 line: 150 days")).toHaveClass("text-neel");
    expectTokenOnly(container);
  });
});
