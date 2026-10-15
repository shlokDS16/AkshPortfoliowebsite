// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { buildConceptView, buildFileView, buildNoteView, listConceptSummaries, type PublicConceptRow, type PublicSnapshot } from "@/modules/showcase";
import { buildSeedSnapshot, withConcepts } from "@/test/fakes/showcase-snapshot";
import { expectNoMotion, expectTokenOnly, mockIntersectionObserver, mockMatchMedia, renderWithMotion } from "@/test/ui";
import { ConceptLine } from "./concept-line";
import { ConceptList } from "./concept-list";
import { ConceptPage } from "./concept-page";
import { FileSections } from "./file-sections";
import { NoteArticle } from "./note-article";

const cycle: PublicConceptRow = { id: "k-cycle", slug: "capital-cycle", name: "Capital cycle" };
const moat: PublicConceptRow = { id: "k-moat", slug: "moats", name: "Moats" };
const world = (): PublicSnapshot =>
  withConcepts(buildSeedSnapshot(), [cycle, moat], [["i1", "r1b", "k-cycle", 2], ["i1", "r1b", "k-moat", 5], ["n0", "rn0", "k-cycle", 1], ["n2", "rn2", "k-cycle", 1]]);

describe("the Concepts line", () => {
  it("is absent when the item has no public concept", () => {
    const { container } = render(<ConceptLine concepts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is one labelled list of links, in the order given, outside the prose", () => {
    const { container } = render(
      <ConceptLine
        concepts={[{ slug: "capital-cycle", name: "Capital cycle", href: "/concepts/capital-cycle" }, { slug: "moats", name: "Moats", href: "/concepts/moats" }]}
      />,
    );
    const list = screen.getByRole("list", { name: "Concepts" });
    expect(within(list).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Capital cycle", "/concepts/capital-cycle"],
      ["Moats", "/concepts/moats"],
    ]);
    expect(container.querySelector("p, h1, h2, h3")).toBeNull();
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

describe("the concepts index", () => {
  it("lists each concept as a link with the machine's count line", () => {
    const { container } = render(<ConceptList concepts={listConceptSummaries(world())} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("link", { name: "Capital cycle" })).toHaveAttribute("href", "/concepts/capital-cycle");
    expect(items[0]).toHaveTextContent("2 notes · 1 file");
    expect(items[1]).toHaveTextContent("1 file");
    expect(container.querySelector("[data-machine]")).not.toBeNull();
    expectTokenOnly(container);
  });
});

describe("a concept page", () => {
  const view = () => buildConceptView(world(), "capital-cycle")!;

  it("has the name as the one h1, the fixed standfirst and the CONCEPT tag", () => {
    const { container } = render(<ConceptPage view={view()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Capital cycle" })).toBeInTheDocument();
    expect(screen.getByText("Notes and case files by Aksh Agrawal that use Capital cycle, newest first.")).toBeInTheDocument();
    expect(screen.getByText("CONCEPT")).toBeInTheDocument();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expectTokenOnly(container);
    expectNoMotion(container);
  });

  it("shows Notes and Applied in as labelled sections with his title, his objective and the machine's Since date", () => {
    render(<ConceptPage view={view()} />);
    const notes = screen.getByRole("region", { name: "Notes" });
    expect(within(notes).getByRole("link", { name: "How to read receivable days" })).toHaveAttribute("href", "/notes/how-to-read-receivable-days");
    expect(within(notes).getByText(/Learn what receivable days measure/)).toBeInTheDocument();
    expect(within(notes).getByText("Since 1 Aug 2026")).toBeInTheDocument();
    const applied = screen.getByRole("region", { name: "Applied in" });
    expect(within(applied).getByRole("link", { name: "Kaveri Pumps: does pricing power survive slower dealer payments" })).toHaveAttribute("href", "/companies/kavpump");
    expect(within(applied).getByText("01")).toBeInTheDocument();
    expect(within(applied).getByText("Since 20 Aug 2026")).toBeInTheDocument();
  });

  it("leaves out a group with nothing in it and names no count", () => {
    render(<ConceptPage view={buildConceptView(world(), "moats")!} />);
    expect(screen.queryByRole("region", { name: "Notes" })).toBeNull();
    expect(screen.getByRole("region", { name: "Applied in" })).toBeInTheDocument();
  });

  it("renders an item with no page as plain text, never a dead link", () => {
    const v = view();
    render(<ConceptPage view={{ ...v, notes: [{ ...v.notes[0], title: "A plain note", href: null }], applied: [] }} />);
    expect(screen.getByText("A plain note")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "A plain note" })).toBeNull();
  });

  it("never prints the words the site does not use", () => {
    const { container } = render(<ConceptPage view={view()} />);
    expect(container.textContent).not.toMatch(/\bproof\b|\bproves?\b|\bverified\b|\bbuy\b|\bsell\b/i);
  });
});

describe("where the line sits", () => {
  beforeEach(() => {
    mockMatchMedia();
    mockIntersectionObserver();
  });

  it("ends the VIEW block of a file, after his words and inside the block", () => {
    const { container } = renderWithMotion(<FileSections file={buildFileView(world(), "kavpump")!} />);
    const view = screen.getByRole("region", { name: "Aksh's view" });
    const list = within(view).getByRole("list", { name: "Concepts" });
    expect(within(list).getAllByRole("link").map((a) => a.textContent)).toEqual(["Capital cycle", "Moats"]);
    // After the prose: the line is the last thing in the block, and nothing in his words links to a concept.
    expect(view.lastElementChild).toBe(container.querySelector("[data-concept-line]"));
    expect(view.querySelector(".prose-read a[href^='/concepts']")).toBeNull();
  });

  it("is on a note, after the body", () => {
    render(<NoteArticle note={buildNoteView(world(), "learning", "how-to-read-receivable-days")!} />);
    expect(within(screen.getByRole("list", { name: "Concepts" })).getByRole("link", { name: "Capital cycle" })).toHaveAttribute("href", "/concepts/capital-cycle");
  });

  it("leaves a file and a note exactly as they were while no concept is public", () => {
    const seed = buildSeedSnapshot();
    const file = renderWithMotion(<FileSections file={buildFileView(seed, "kavpump")!} />);
    expect(file.container.querySelector("[data-concept-line]")).toBeNull();
    expect(file.container.textContent).not.toContain("Concepts");
    file.unmount();
    const note = render(<NoteArticle note={buildNoteView(seed, "learning", "how-to-read-receivable-days")!} />);
    expect(note.container.querySelector("[data-concept-line]")).toBeNull();
  });
});
