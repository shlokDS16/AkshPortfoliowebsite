// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemsSubnav } from "./items-subnav";

// Phase 5d (spec s8): no Videos or Letters link in the Items nav while they are off.
describe("ItemsSubnav", () => {
  const names = () => screen.getAllByRole("link").map((l) => l.textContent);

  it("offers Concepts and This month only while both features are off", () => {
    render(<ItemsSubnav ownVideos={false} letters={false} />);
    expect(names()).toEqual(["Concepts", "This month"]);
    expect(screen.getByRole("navigation")).toHaveAccessibleName("Concepts and the month");
  });

  it("adds each link with its own feature", () => {
    const { unmount } = render(<ItemsSubnav ownVideos letters={false} />);
    expect(names()).toEqual(["Concepts", "This month", "Videos"]);
    unmount();
    render(<ItemsSubnav ownVideos={false} letters />);
    expect(names()).toEqual(["Concepts", "This month", "Letters"]);
  });

  it("links to the same pages as before", () => {
    render(<ItemsSubnav ownVideos letters />);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/desk/concepts", "/desk/learned", "/desk/videos", "/desk/letters"]);
  });
});
