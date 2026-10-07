// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutHeadings } from "@/test/headings";
import { mockIntersectionObserver } from "@/test/ui";
import { useActiveSection } from "./use-active-section";

const IDS = ["view", "tests", "facts", "history"];
// Document offsets of the four headings; with no computed scroll-margin-top the hook's line is 1 px (0 + 1).
const TOPS = { view: 200, tests: 1000, facts: 2000, history: 3000 };

function mountHeadings() {
  for (const id of IDS) {
    const h = document.createElement("h2");
    h.id = id;
    document.body.append(h);
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("useActiveSection", () => {
  it("scrolling up out of a section's body selects the earlier section", () => {
    const io = mockIntersectionObserver();
    const layout = layoutHeadings(TOPS);
    mountHeadings();
    layout.scrollTo(2100); // inside Facts
    const { result } = renderHook(() => useActiveSection(IDS));
    expect(result.current).toBe("facts");
    layout.scrollTo(1100); // scrolled up: Facts heading left the band downwards, Tests heading is above the line
    act(() => io.trigger(document.getElementById("facts")!, false));
    expect(result.current).toBe("tests");
  });

  it("a mount mid-page (reload with restored scroll) selects the right section", () => {
    mockIntersectionObserver();
    const layout = layoutHeadings(TOPS);
    mountHeadings();
    layout.scrollTo(3050);
    const { result } = renderHook(() => useActiveSection(IDS));
    expect(result.current).toBe("history");
  });

  it("above the first heading selects the first", () => {
    mockIntersectionObserver();
    const layout = layoutHeadings(TOPS);
    mountHeadings();
    layout.scrollTo(0);
    const { result } = renderHook(() => useActiveSection(IDS));
    expect(result.current).toBe("view");
  });

  it("reads the line from the heading's scroll-margin-top when it has one", () => {
    mockIntersectionObserver();
    const layout = layoutHeadings(TOPS);
    mountHeadings();
    const first = document.getElementById("view")!;
    vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element) => ({ scrollMarginTop: el === first ? "300px" : "" })) as typeof getComputedStyle);
    layout.scrollTo(0); // Tests top is 1000, far below even a 300 px line
    const { result, unmount } = renderHook(() => useActiveSection(IDS));
    expect(result.current).toBe("view");
    unmount();
    layout.scrollTo(750); // Tests top is now 250 <= 301: active only because the line is 300, not 0
    const again = renderHook(() => useActiveSection(IDS));
    expect(again.result.current).toBe("tests");
  });
});
