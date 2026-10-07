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
    expect(within(rows[2]).getAllByText("Not disclosed yet")).toHaveLength(1);
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

  it("a withheld reading shows the marker and no empty box", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    render(<KillCriteriaTable tests={[{ ...KILL_TESTS[2], withheldUntil: "2026-10-25" }]} />);
    expect(screen.getByText("[withheld until 25 Oct 2026]")).toBeInTheDocument();
    expect(screen.queryByText("Not disclosed yet")).toBeNull();
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

  it("direction below shades from the scale start to the threshold", () => {
    const { container } = render(<ThresholdMeter meter={KILL_TESTS[1].meter!} />);
    const zone = container.querySelector("[data-mark='met-zone']")?.getAttribute("style");
    expect(zone).toContain("left: 0%");
    expect(zone).toContain("width: 40%");
    expect(container.querySelector("[data-mark='current']")?.getAttribute("style")).toContain("left: 57%");
  });

  it("never prints NaN for an empty or inverted range", () => {
    const base = KILL_TESTS[0].meter!;
    for (const range of [{ min: 100, max: 100 }, { min: 200, max: 60 }]) {
      const { container, unmount } = render(<ThresholdMeter meter={{ ...base, ...range }} />);
      expect(container.innerHTML).not.toContain("NaN");
      unmount();
    }
    const { container } = render(<ThresholdMeter meter={{ ...base, min: 200, max: 60 }} />);
    expect(container.querySelector("[data-mark='threshold']")?.getAttribute("style")).toContain("left: 64.29%");
  });

  it("gives the threshold label its own row above the track, so it never meets the min/max captions (T1, T2)", () => {
    for (const t of KILL_TESTS.slice(0, 2)) {
      const { container, unmount } = render(<ThresholdMeter meter={t.meter!} />);
      const rows = [...container.querySelectorAll("[data-row]")].map((r) => r.getAttribute("data-row"));
      expect(rows).toEqual(["threshold-label", "track", "scale"]);
      const labelRow = container.querySelector("[data-row='threshold-label']")!;
      const scaleRow = container.querySelector("[data-row='scale']")!;
      expect(labelRow.textContent).toBe(t.meter!.labels.threshold);
      expect([...scaleRow.children].map((c) => c.textContent)).toEqual([t.meter!.labels.min, t.meter!.labels.max]);
      unmount();
    }
  });

  it("anchors the label at its own matching point, so its box stays inside the meter at any threshold", () => {
    const base = KILL_TESTS[0].meter!;
    for (const [threshold, at] of [[base.min, 0], [150, 64.29], [base.max, 100]] as const) {
      const { unmount } = render(<ThresholdMeter meter={{ ...base, threshold }} />);
      const el = screen.getByText(base.labels.threshold);
      expect(parseFloat(el.style.left)).toBe(at);
      expect(el.style.transform).toMatch(/^translateX\(-[\d.]+%\)$/);
      expect(parseFloat(el.style.transform.slice("translateX(-".length))).toBe(at);
      unmount();
    }
  });
});
