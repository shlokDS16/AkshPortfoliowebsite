// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SITE_COUNTS, STREAK } from "@/test/fixtures/desk-ui";
import { expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { PublicFrame, tabFor } from "./public-frame";

describe("PublicFrame", () => {
  it("site pages: strip on desktop top, disclosure line at the phone bottom, rail and tab bar, one main", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(
      <PublicFrame current="notes" chrome={{ counts: SITE_COUNTS, streak: STREAK }} strip={{ variant: "site" }}>
        <h1>Learning notes</h1>
      </PublicFrame>,
    );
    expect(screen.getByRole("complementary", { name: "Disclosure summary" })).toHaveTextContent("Aksh is not SEBI-registered");
    expect(screen.getByRole("link", { name: "Disclosures" })).toHaveAttribute("href", "/about#disclosures");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: /Notes/ })).toHaveAttribute("aria-current", "page");
    expectTokenOnly(document.body);
  });

  it("file pages: the file strip is the only disclosure summary; no site line", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(
      <PublicFrame current="files" chrome={{ counts: SITE_COUNTS, streak: STREAK }} strip={{ variant: "file", holdsPosition: "no", dataAsOf: "2026-08-22" }} topBar="file">
        <h1>Kaveri</h1>
      </PublicFrame>,
    );
    expect(screen.getAllByRole("complementary", { name: "Disclosure summary" })).toHaveLength(1);
    expect(screen.getByRole("complementary")).toHaveTextContent("Aksh holds no position · Figures to 22 Aug 2026");
    expect(screen.queryByRole("link", { name: "Disclosures" })).toBeNull();
  });

  it("maps rail sections to tabs; Process and Mistakes have none", () => {
    expect(tabFor("files")).toBe("files");
    expect(tabFor("process")).toBeNull();
    expect(tabFor("mistakes")).toBeNull();
    expect(tabFor("cases")).toBeNull();
  });

  it("case pages (Plan 3b): the phone back link goes to the cases, and no rail item or tab claims the page", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(
      <PublicFrame
        current="cases"
        chrome={{ counts: SITE_COUNTS, streak: STREAK }}
        strip={{ variant: "file", holdsPosition: "no", dataAsOf: "2026-06-16" }}
        topBar="file"
        back={{ href: "/cases", label: "Cases" }}
      >
        <h1>Kaveri Seed</h1>
      </PublicFrame>,
    );
    expect(screen.getByRole("link", { name: "Back to Cases" })).toHaveAttribute("href", "/cases");
    expect(document.querySelectorAll("nav [aria-current]")).toHaveLength(0);
  });

  it("the rail shows no number beside Mistakes: the page lists his own calls and carries no count (addendum s6)", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    renderWithMotion(
      <PublicFrame current="mistakes" chrome={{ counts: SITE_COUNTS, streak: STREAK }} strip={{ variant: "site" }}>
        <h1>Mistakes</h1>
      </PublicFrame>,
    );
    const rail = screen.getByRole("navigation", { name: "Site" });
    expect(within(rail).getByRole("link", { name: "Mistakes" })).toHaveTextContent(/^Mistakes$/);
    expect(within(rail).getByRole("link", { name: /^Learning notes/ })).toHaveTextContent(/\d/);
  });
});
