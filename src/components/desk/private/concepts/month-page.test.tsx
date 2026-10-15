// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MonthView } from "@/modules/knowledge";
import type { ConceptRef, ItemLine } from "@/modules/knowledge/client";
import { expectTokenOnly } from "@/test/ui";
import { MonthPage } from "./month-page";

const line = (id: string, kind: string, title: string, createdAt: string): ItemLine => ({ id, kind, title, createdAt, visibility: "private", status: "draft" });
const ref = (name: string): ConceptRef => ({ id: `id-${name}`, slug: name.toLowerCase(), name, status: "private" });

const EMPTY: MonthView = { month: "2026-10", prevMonth: "2026-09", nextMonth: null, learningCount: 0, readCount: 0, groups: [], reads: [] };

describe("MonthPage", () => {
  it("an empty month says what to type, and still lets him move back", () => {
    render(<MonthPage view={EMPTY} />);
    expect(screen.getByRole("heading", { level: 1, name: "What I learned in October 2026" })).toBeInTheDocument();
    expect(screen.getByText("Nothing logged in October 2026. A line starting with l: is a learning; r: is something you read.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Earlier month" })).toHaveAttribute("href", "/desk/learned?m=2026-09");
    expect(screen.queryByRole("link", { name: "Later month" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Learnings/ })).toBeNull();
  });

  it("labels the page as put together by the desk, with his words as he wrote them", () => {
    render(<MonthPage view={EMPTY} />);
    expect(screen.getByText("Put together by the desk from your dated learnings and reads. Your words are shown as you wrote them.")).toBeInTheDocument();
  });

  it("two concept groups and No concept last; titles exactly as stored; counts in the machine face", () => {
    const view: MonthView = {
      ...EMPTY,
      learningCount: 3,
      readCount: 1,
      groups: [
        { concept: ref("Moats"), items: [line("a", "learning", "  Odd -- title?! ", "2026-10-02T05:00:00Z"), line("b", "learning", "Second", "2026-10-09T05:00:00Z")] },
        { concept: null, items: [line("c", "learning", "Loose one", "2026-10-11T05:00:00Z")] },
      ],
      reads: [line("r", "reading_note", "Marks memo", "2026-10-04T05:00:00Z")],
    };
    const { container } = render(<MonthPage view={view} />);
    const learnings = screen.getByRole("heading", { level: 2, name: "Learnings (3)" });
    expect(within(learnings).getByText("(3)")).toHaveClass("font-mono");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Moats", "No concept"]);
    expect(screen.getByRole("link", { name: "Moats" })).toHaveAttribute("href", "/desk/concepts/moats");
    const odd = screen.getByRole("link", { name: /Odd -- title/ });
    expect(odd.textContent).toBe("  Odd -- title?! ");
    expect(odd).toHaveAttribute("href", "/desk/items/a");
    expect(screen.getByText("2 Oct 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Reads (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marks memo" })).toHaveAttribute("href", "/desk/items/r");
    expectTokenOnly(container);
  });

  it("only reads: the Learnings section is left out and the page is not called empty", () => {
    render(<MonthPage view={{ ...EMPTY, readCount: 1, reads: [line("r", "reading_note", "Marks memo", "2026-10-04T05:00:00Z")] }} />);
    expect(screen.queryByRole("heading", { name: /Learnings/ })).toBeNull();
    expect(screen.queryByText(/Nothing logged in/)).toBeNull();
  });

  it("offers Later month when there is one", () => {
    render(<MonthPage view={{ ...EMPTY, month: "2026-09", prevMonth: "2026-08", nextMonth: "2026-10" }} />);
    expect(screen.getByRole("link", { name: "Later month" })).toHaveAttribute("href", "/desk/learned?m=2026-10");
    expect(screen.getByRole("link", { name: "Earlier month" })).toHaveAttribute("href", "/desk/learned?m=2026-08");
  });
});
