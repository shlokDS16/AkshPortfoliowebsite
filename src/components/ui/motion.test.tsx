// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import * as m from "motion/react-m";
import { describe, expect, it, vi } from "vitest";
import { expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { CountFlow } from "./count-flow";
import { cardMotion, drawerMotion, scrimMotion, sheetMotion } from "./motion-presets";
import { MotionRoot } from "./motion-root";
import { EASE_SNAP, EASE_SNAP_IN, MOTION, easeCss } from "./motion-tokens";
import { SegmentedControl } from "./segmented-control";
import { TickInView } from "./tick-in-view";

vi.mock("@number-flow/react", () => ({
  default: (props: { value: number; respectMotionPreference?: boolean }) => (
    <span data-testid="flow" data-respect={String(props.respectMotionPreference)}>
      {props.value}
    </span>
  ),
}));

describe("motion tokens", () => {
  it("match globals.css exactly", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(`--motion-fast: ${MOTION.fast * 1000}ms;`);
    expect(css).toContain(`--motion-base: ${MOTION.base * 1000}ms;`);
    expect(css).toContain(`--motion-slow: ${MOTION.slow * 1000}ms;`);
    expect(css).toContain(`--ease-snap: ${easeCss(EASE_SNAP)};`);
    expect(css).toContain(`--ease-snap-in: ${easeCss(EASE_SNAP_IN)};`);
  });

  it("reduce every preset to a 120 ms opacity fade under reduced motion", () => {
    for (const preset of [drawerMotion(true), cardMotion(true), sheetMotion(true), scrimMotion(true)]) {
      expect(Object.keys(preset.initial)).toEqual(["opacity"]);
      expect(preset.animate.transition.duration).toBe(MOTION.fast);
    }
    expect(drawerMotion(false).animate.transition.duration).toBe(MOTION.base);
    expect(cardMotion(false).animate.transition.duration).toBe(MOTION.slow);
    expect(drawerMotion(false).exit.transition).toEqual({ duration: MOTION.fast, ease: EASE_SNAP_IN });
    // Base UI detects exit through an opacity animation (its animation handbook).
    expect(sheetMotion(false).initial.opacity).toBe(0.9999);
  });
});

describe("MotionRoot", () => {
  it("renders server children and allows m components under strict LazyMotion", () => {
    render(
      <MotionRoot>
        <m.p>inside</m.p>
      </MotionRoot>,
    );
    expect(screen.getByText("inside")).toBeInTheDocument();
  });
});

describe("CountFlow", () => {
  it("renders the final value as plain text, then rolls only on a client-side change", async () => {
    const { rerender } = render(<CountFlow value={1234} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("flow")).toHaveTextContent("1234"));
    rerender(<CountFlow value={1240} />);
    expect(screen.getByTestId("flow")).toHaveTextContent("1240");
    // NumberFlow honours prefers-reduced-motion by default; we never switch that off.
    expect(screen.getByTestId("flow")).toHaveAttribute("data-respect", "undefined");
  });
});

describe("TickInView", () => {
  it("arms the status tick once the block scrolls into view", () => {
    mockMatchMedia();
    const io = mockIntersectionObserver();
    render(<TickInView>rows</TickInView>);
    const box = screen.getByText("rows");
    expect(box).not.toHaveAttribute("data-tick");
    act(() => io.trigger(box, true));
    expect(box).toHaveAttribute("data-tick", "run");
  });

  it("never arms under reduced motion", () => {
    mockMatchMedia({ reducedMotion: true });
    const io = mockIntersectionObserver();
    render(<TickInView>rows</TickInView>);
    act(() => io.trigger(screen.getByText("rows"), true));
    expect(screen.getByText("rows")).not.toHaveAttribute("data-tick");
  });
});

describe("SegmentedControl", () => {
  const items = [
    { value: "chart", label: "Chart" },
    { value: "table", label: "Table" },
    { value: "notes", label: "Notes" },
  ];

  it("is a radio group driven by click and arrow keys, with the indicator on the checked item", async () => {
    const onValueChange = vi.fn();
    renderWithMotion(<SegmentedControl aria-label="Show as" value="chart" onValueChange={onValueChange} items={items} />);
    const group = screen.getByRole("radiogroup", { name: "Show as" });
    expect(screen.getByRole("radio", { name: "Chart" })).toHaveAttribute("aria-checked", "true");
    screen.getByRole("radio", { name: "Table" }).click();
    expect(onValueChange).toHaveBeenLastCalledWith("table");
    onValueChange.mockClear();
    act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("notes");
    expect(screen.getByRole("radio", { name: "Chart" }).querySelector("[data-indicator]")).not.toBeNull();
    expectTokenOnly(group);
  });

  it("still switches with reduced motion (the indicator jumps)", () => {
    const onValueChange = vi.fn();
    renderWithMotion(<SegmentedControl aria-label="Show as" value="table" onValueChange={onValueChange} items={items} />, {
      reducedMotion: true,
    });
    expect(screen.getByRole("radio", { name: "Table" }).querySelector("[data-indicator]")).not.toBeNull();
  });
});
