// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SITE_COUNTS, STREAK } from "@/test/fixtures/desk-ui";
import { DeskRail } from "./desk-rail";

describe("the rail's Videos entry (Plan 5b)", () => {
  it("is absent until a video is listed, so the deploy state links to nothing that is a 404", () => {
    render(<DeskRail current="desk" counts={SITE_COUNTS} streak={STREAK} />);
    expect(screen.queryByRole("link", { name: /Videos/ })).toBeNull();
  });

  it("appears with its count once one is listed, and is current on the videos pages", () => {
    render(<DeskRail current="videos" counts={{ ...SITE_COUNTS, videos: 2 }} streak={STREAK} />);
    const link = screen.getByRole("link", { name: /Videos/ });
    expect(link).toHaveAttribute("href", "/videos");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveTextContent("2");
  });
});
