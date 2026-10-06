// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FILE_SECTIONS, SITE_COUNTS, STREAK } from "@/test/fixtures/desk-ui";
import { expectNoMotion, expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { DeskRail } from "./desk-rail";
import { PhoneIndex } from "./phone-index";
import { ReadingHairline } from "./reading-hairline";
import { StreakStrip } from "./streak-strip";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

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

  it("renders under reduced motion without moving", () => {
    renderWithMotion(<TabBar current="desk" counts={{ files: 0, notes: 0 }} hideOnScroll />, { reducedMotion: true });
    expect(screen.getByRole("navigation", { name: "Main" }).getAttribute("style") ?? "").not.toContain("translateY(100%)");
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
