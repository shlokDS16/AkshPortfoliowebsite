// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HOME_STATS, REGISTER, WHAT_CHANGED } from "@/test/fixtures/desk-ui";
import { expectNoMotion, expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { FileTitleTransition } from "./file-title-transition";
import { RegisterTable } from "./register-table";
import { StatTile } from "./stat-tile";
import { UnitSquares } from "./unit-squares";
import { WhatChangedList } from "./what-changed-list";

describe("StatTile and UnitSquares", () => {
  it("shows a desk-activity count with its unit and context; zero says none yet", () => {
    const { container, rerender } = render(<StatTile label="Files" value={2} unit="companies" context="2 sectors · last 20 Aug 2026" />);
    expect(screen.getByText("Files")).toHaveClass("text-label");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("2 sectors · last 20 Aug 2026")).toBeInTheDocument();
    rerender(<StatTile label="Revisions" value={0} />);
    expect(screen.getByText("none yet")).toBeInTheDocument();
    expectTokenOnly(container);
  });

  it("unit squares: one ink shape per test, ordered Met, Watching, Not met, No data, spelled out", () => {
    mockMatchMedia();
    mockIntersectionObserver();
    const { container } = render(<UnitSquares counts={HOME_STATS.tests} />);
    expect(screen.getByRole("img", { name: "0 met, 2 watching, 2 not met, 1 no data" })).toBeInTheDocument();
    const statuses = [...container.querySelectorAll("[data-status]")].map((el) => el.getAttribute("data-status"));
    expect(statuses).toEqual(["watching", "watching", "not_met", "not_met", "no_data"]);
  });
});

describe("WhatChangedList", () => {
  it("lists entries reason first, with the file number and what moved", () => {
    const { container } = render(<WhatChangedList entries={WHAT_CHANGED} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("20 Aug 2026");
    expect(within(items[0]).getByText("01")).toHaveClass("text-geru");
    expect(within(items[0]).getByRole("link", { name: "Kaveri Pumps (fictional)" })).toHaveAttribute("href", "/companies/kavpump");
    expect(items[0]).toHaveTextContent("Revision R2 · 2 sentences changed · figures to 30 Jun 2026");
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("explains an empty list", () => {
    render(<WhatChangedList entries={[]} />);
    expect(screen.getByText(/Nothing has changed yet/)).toBeInTheDocument();
  });
});

describe("RegisterTable", () => {
  it("one row per public file with the figures-to column; search keeps its height and explains no match", async () => {
    mockMatchMedia();
    const { container } = renderWithMotion(<RegisterTable files={REGISTER} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Kaveri Pumps (fictional)" })).toHaveAttribute("href", "/companies/kavpump");
    expect(screen.getByRole("columnheader", { name: "Figures to" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a file" }), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent('No file matches "zzz". Search covers company names, symbols and sectors.');
    expect(container.querySelector<HTMLElement>("[data-register]")?.style.minHeight).not.toBe("");
    expectTokenOnly(container);
  });

  it("the phone card carries the test summary and the figures-to date (rule 3), not only the desk columns", () => {
    mockMatchMedia();
    renderWithMotion(<RegisterTable files={REGISTER} />);
    const row = screen.getByRole("link", { name: "Kaveri Pumps (fictional)" }).closest("tr") as HTMLElement;
    expect(within(row).getByRole("img", { name: "0 met, 1 watching, 1 not met, 1 no data" })).toBeInTheDocument();
    expect(within(row).getByText("Figures to 30 Jun 2026")).toBeInTheDocument();
    expect(row).toHaveTextContent("R2 · 20 Aug 2026");
  });

  it("reorders instantly under reduced motion", async () => {
    mockMatchMedia({ reducedMotion: true });
    renderWithMotion(<RegisterTable files={REGISTER} />, { reducedMotion: true });
    await userEvent.click(screen.getByRole("radio", { name: "Company" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Kaveri Pumps (fictional)");
  });

  it("explains an empty register", () => {
    renderWithMotion(<RegisterTable files={[]} />);
    expect(screen.getByText(/No files yet/)).toBeInTheDocument();
  });
});

describe("FileTitleTransition", () => {
  it("falls back to plain children when React has no ViewTransition (Vitest uses stable react)", () => {
    render(
      <FileTitleTransition fileNo="01">
        <h1>Kaveri Pumps</h1>
      </FileTitleTransition>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Kaveri Pumps" })).toBeInTheDocument();
  });
});
