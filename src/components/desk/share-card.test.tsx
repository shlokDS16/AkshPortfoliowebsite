// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OG } from "@/lib/theme-colors";
import { fileCardContent, HOME_CARD, ShareCardImage } from "./share-card";

const model = {
  fileNo: "01", revNo: 2, company: "Kaveri Pumps (fictional)", title: "Kaveri Pumps: does pricing power survive slower dealer payments",
  learningObjective: "Learn to read receivable days next to margins when judging pricing power.", revisedOn: "2026-08-20", dataAsOf: "2026-08-22",
};

describe("share card (segment 5; rule 8)", () => {
  it("uses only already-linted fields plus fixed copy, with the figures-to date and 'For learning, not advice'", () => {
    expect(fileCardContent(model)).toEqual({
      tag: "FILE", number: "01", sub: "R2", title: "Kaveri Pumps (fictional)", standfirst: model.learningObjective,
      footerLeft: "Revised 20 Aug 2026 · figures to 22 Aug 2026", footerRight: "For learning, not advice",
    });
    expect(HOME_CARD.footerRight).toBe("For learning, not advice");
  });

  it("renders Satori-safe flex markup in the light palette", () => {
    const { container } = render(<ShareCardImage c={fileCardContent(model)} />);
    expect(screen.getByText("Kaveri Pumps (fictional)")).toBeInTheDocument();
    expect(screen.getByText("For learning, not advice")).toBeInTheDocument();
    // Satori lays out only flex containers: every div with more than one child must be one.
    for (const el of container.querySelectorAll<HTMLElement>("div")) if (el.childNodes.length > 1) expect(el.style.display).toBe("flex");
    expect(container.firstElementChild?.getAttribute("style")).toMatch(new RegExp(`background:\\s*(${OG.paper}|rgb\\(247, 242, 232\\))`, "i"));
  });
});
