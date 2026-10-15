// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConceptIndexRow } from "@/modules/knowledge";
import { expectTokenOnly } from "@/test/ui";
import { ConceptList } from "./concept-list";

const row = (name: string, status: "private" | "public" | "unchecked", counts: Partial<ConceptIndexRow["counts"]>, lastActivity: string | null): ConceptIndexRow => {
  const full = { learning: 0, file: 0, process: 0, read: 0, note: 0, ...counts };
  return { concept: { id: name, slug: name.toLowerCase(), name, status }, counts: full, total: Object.values(full).reduce((a, b) => a + b, 0), lastActivity };
};

describe("ConceptList", () => {
  it("says what an empty index will hold and how to start one", () => {
    render(<ConceptList rows={[]} />);
    expect(screen.getByText("No concepts yet. Write #name in a capture, for example #capital-cycle.")).toBeInTheDocument();
  });

  it("shows name, status in words, counts per kind and the date of last activity", () => {
    const { container } = render(
      <ConceptList rows={[row("Moats", "public", { learning: 2, read: 1 }, "2026-10-12T05:00:00Z"), row("Rates", "private", {}, null)]} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByRole("link", { name: "Moats" })).toHaveAttribute("href", "/desk/concepts/moats");
    expect(items[0]).toHaveTextContent("Public");
    expect(items[0]).toHaveTextContent("2 learnings");
    expect(items[0]).toHaveTextContent("1 read");
    expect(items[0]).not.toHaveTextContent("1 reads");
    expect(items[0]).toHaveTextContent("12 Oct 2026");
    expect(items[0]).not.toHaveTextContent("Process");
    expect(items[1]).toHaveTextContent("Private");
    expect(items[1]).toHaveTextContent("Nothing linked yet");
    expectTokenOnly(container);
  });

  it("counts in singular or plural by number, in plain words", () => {
    render(<ConceptList rows={[row("A", "public", { learning: 1, read: 2 }, null), row("B", "public", { file: 1, process: 3, note: 1 }, null), row("C", "public", { file: 2, process: 1, note: 4 }, null)]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1 learning · 2 reads");
    expect(items[1]).toHaveTextContent("1 file or case study · 3 process notes · 1 note");
    expect(items[2]).toHaveTextContent("2 files and case studies · 1 process note · 4 notes");
  });
});
