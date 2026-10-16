// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithMotion } from "@/test/ui";
import { DeskTabs } from "./desk-tabs";

const path = vi.hoisted(() => ({ value: "/desk" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

const items = () => within(screen.getByRole("navigation", { name: "Desk sections" })).getByRole("link", { name: "Items" });

// Phase 5d (spec s8): the Items tab claims /desk/videos and /desk/letters only while those features are on.
describe("DeskTabs and the hidden desk pages", () => {
  it.each(["/desk/videos", "/desk/videos/abc", "/desk/letters", "/desk/letters/new"])("%s does not mark Items current by default", (p) => {
    path.value = p;
    renderWithMotion(<DeskTabs names={0} inbox={0} variant="top" />);
    expect(items()).not.toHaveAttribute("aria-current");
  });

  it("each flag brings back only its own pages", () => {
    path.value = "/desk/videos/abc";
    const { unmount } = renderWithMotion(<DeskTabs names={0} inbox={0} variant="top" ownVideos />);
    expect(items()).toHaveAttribute("aria-current", "page");
    unmount();
    path.value = "/desk/letters/new";
    renderWithMotion(<DeskTabs names={0} inbox={0} variant="top" ownVideos />);
    expect(items()).not.toHaveAttribute("aria-current");
  });

  it("the pages that stay (items, concepts, the month) keep it current", () => {
    for (const p of ["/desk/items", "/desk/concepts/x", "/desk/learned"]) {
      path.value = p;
      const { unmount } = renderWithMotion(<DeskTabs names={0} inbox={0} variant="top" />);
      expect(items()).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });
});
