// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FILE_SECTIONS, SITE_COUNTS, STREAK } from "@/test/fixtures/desk-ui";
import { layoutHeadings } from "@/test/headings";
import { expectNoMotion, expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { DeskRail } from "./desk-rail";
import { PhoneIndex } from "./phone-index";
import { ReadingHairline } from "./reading-hairline";
import { StreakStrip } from "./streak-strip";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

/** Motion's scroll tracking reads document.scrollingElement.scrollTop, which jsdom does not lay out. */
async function scrollTo(y: number) {
  Object.defineProperty(document, "scrollingElement", { value: document.documentElement, configurable: true });
  Object.defineProperty(document.documentElement, "scrollTop", { value: y, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 60));
  });
}

describe("TopBar", () => {
  it("home: wordmark and Find a file; file: back to Files on phone", () => {
    const { container, rerender } = render(<TopBar variant="home" />);
    expect(screen.getByText("Aksh Agrawal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a file" })).toHaveAttribute("href", "/companies#find");
    rerender(<TopBar variant="file" />);
    expect(screen.getByRole("link", { name: "Back to Files" })).toHaveAttribute("href", "/companies");
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("DeskRail", () => {
  it("lists site sections with counts (0 is shown), marks the current one, keeps About", () => {
    mockIntersectionObserver();
    renderWithMotion(<DeskRail current="files" counts={SITE_COUNTS} streak={STREAK} />);
    const rail = screen.getByRole("navigation", { name: "Site" });
    expect(within(rail).getByRole("link", { name: /Files/ })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("link", { name: /Mistakes/ })).toHaveTextContent("0");
    expect(within(rail).getByRole("link", { name: "About and disclosures" })).toBeInTheDocument();
    expect(within(rail).getByText(/22 of the last 30 days research logged; counts only/)).toBeInTheDocument();
    expectTokenOnly(rail);
  });

  it("opens into the current file's sections", () => {
    mockIntersectionObserver();
    renderWithMotion(
      <DeskRail current="files" counts={SITE_COUNTS} streak={STREAK} file={{ fileNo: "01", shortName: "Kaveri Pumps", sections: FILE_SECTIONS }} />,
    );
    expect(screen.getByRole("link", { name: /^Tests/ })).toHaveAttribute("href", "#tests");
  });
});

describe("PhoneIndex", () => {
  it("is a nav of in-page links; the indicator follows the section in view", () => {
    const io = mockIntersectionObserver();
    const layout = layoutHeadings({ view: 20, tests: 900, facts: 1800, history: 2700 });
    renderWithMotion(
      <div>
        <PhoneIndex sections={FILE_SECTIONS} />
        <h2 id="view">View</h2>
        <h2 id="tests">Tests</h2>
        <h2 id="facts">Facts</h2>
        <h2 id="history">History</h2>
      </div>,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getByRole("link", { name: "View" })).toHaveAttribute("aria-current", "true");
    layout.scrollTo(900);
    act(() => io.trigger(document.getElementById("tests")!, true));
    expect(within(nav).getByRole("link", { name: /Tests/ })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: /History/ })).toHaveTextContent("R2");
    expectTokenOnly(nav);
  });

  it("the indicator jumps under reduced motion and the hairline stays", () => {
    mockIntersectionObserver();
    renderWithMotion(<PhoneIndex sections={FILE_SECTIONS} />, { reducedMotion: true });
    expect(document.querySelector("[data-hairline]")).not.toBeNull();
  });
});

describe("ReadingHairline", () => {
  it("uses the CSS scroll timeline where supported, a Motion scroll value otherwise", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { unmount } = renderWithMotion(<ReadingHairline targetId="file-body" />);
    expect(document.querySelector("[data-hairline='css']")).toHaveClass("progress-hairline");
    unmount();
    vi.stubGlobal("CSS", { supports: () => false });
    renderWithMotion(<ReadingHairline targetId="file-body" />);
    expect(document.querySelector("[data-hairline='js']")).not.toBeNull();
  });

  it("falls back to page progress when the target element is missing, without an error", async () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener("error", onError);
    renderWithMotion(<ReadingHairline targetId="no-such-element" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    window.removeEventListener("error", onError);
    expect(document.querySelector("[data-hairline]")).not.toBeNull();
    expect(errors).toEqual([]);
  });
});

describe("TabBar", () => {
  it("shows four labelled tabs with counts and marks the current one; hidden on desktop", () => {
    renderWithMotion(<TabBar current="files" counts={{ files: 7, notes: 3 }} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("desk:hidden");
    expect(within(nav).getByRole("link", { name: /Files 7/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /Notes 3/ })).toBeInTheDocument();
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expectTokenOnly(nav);
  });

  it("hides and goes inert when scrolled down, shows again when scrolled up", async () => {
    mockMatchMedia();
    await scrollTo(0);
    renderWithMotion(<TabBar current="desk" counts={{ files: 0, notes: 0 }} hideOnScroll />);
    await scrollTo(0);
    await scrollTo(300);
    const nav = () => screen.getByRole("navigation", { name: "Main", hidden: true });
    await waitFor(() => expect(nav()).toHaveAttribute("inert"));
    await waitFor(() => expect(nav().getAttribute("style") ?? "").toContain("translateY(100%)"));
    await scrollTo(200);
    await waitFor(() => expect(nav()).not.toHaveAttribute("inert"));
  });

  it("under reduced motion it still hides on scroll down, instantly and inert, and returns on scroll up", async () => {
    mockMatchMedia({ reducedMotion: true });
    await scrollTo(0);
    renderWithMotion(<TabBar current="desk" counts={{ files: 0, notes: 0 }} hideOnScroll />, { reducedMotion: true });
    await scrollTo(0);
    await scrollTo(600);
    const nav = screen.getByRole("navigation", { name: "Main", hidden: true });
    const style = () => nav.getAttribute("style") ?? "";
    // Inside the 60 ms scroll tick plus 100 ms: a 180 ms slide could not have finished, a jump has.
    await waitFor(() => expect(style()).toContain("translateY(100%)"), { timeout: 100 });
    expect(nav).toHaveAttribute("inert");
    expect(style()).not.toMatch(/transition/);
    await scrollTo(400);
    await waitFor(() => expect(style()).not.toContain("translateY(100%)"), { timeout: 100 });
    expect(nav).not.toHaveAttribute("inert");
  });
});

describe("StreakStrip", () => {
  it("shows counts only, honestly when empty", () => {
    const { container, rerender } = render(<StreakStrip {...STREAK} />);
    expect(screen.getByRole("img", { name: "Research logged on 22 of the last 30 days" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(30);
    rerender(<StreakStrip cells={Array(30).fill(false)} daysLogged={0} lastEntry={null} />);
    expect(screen.getByText(/No research logged in the last 30 days/)).toBeInTheDocument();
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("matchMedia", () => {
  it("is mocked per test", () => {
    mockMatchMedia({ desk: true });
    expect(window.matchMedia("(min-width: 60rem)").matches).toBe(true);
  });
});
