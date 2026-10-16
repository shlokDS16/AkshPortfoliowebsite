// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectTokenOnly } from "@/test/ui";
import type { SourceRecord } from "@/modules/sources/client";
import { conceptSourceLines, ConceptSources, type ConceptSourceLine } from "./concept-sources";

const line = (over: Partial<ConceptSourceLine> = {}): ConceptSourceLine => ({
  id: "s1", title: "How a pump maker finances its dealers", site: "Dealer Finance Channel", host: "youtube.com", kind: "youtube", savedOn: "2026-10-03", ...over,
});

describe("a concept's Sources list (read only)", () => {
  it("is absent when no source is attached to the concept", () => {
    const { container } = render(<ConceptSources slug="moats" lines={[]} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each source's title in the machine face with its channel or site and the day it was saved, and links to the full list for the concept", () => {
    const { container } = render(<ConceptSources slug="moats" lines={[line(), line({ id: "s2", title: null, site: null, host: "blog.example.org", kind: "web" })]} total={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sources" })).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("How a pump maker finances its dealers").closest("[data-machine]")).not.toBeNull();
    expect(items[0]).toHaveTextContent("Dealer Finance Channel");
    expect(items[0]).toHaveTextContent("Saved 3 Oct 2026");
    // A link not read yet shows its host, not an invented title.
    expect(items[1]).toHaveTextContent("blog.example.org");
    expect(screen.getByRole("link", { name: /^See all 2 in Sources/ })).toHaveAttribute("href", "/desk/sources?concept=moats");
    expectTokenOnly(container);
  });

  it("says how many more there are when the list is cut", () => {
    render(<ConceptSources slug="moats" lines={[line()]} total={9} />);
    expect(screen.getByRole("link", { name: /^See all 9 in Sources/ })).toBeInTheDocument();
  });
});

describe("conceptSourceLines", () => {
  const record = (n: number): SourceRecord => ({
    id: `s${n}`, url: `https://www.example.org/post-${n}`, kind: "web", youtubeId: null, note: "private", createdAt: "2026-10-03T20:00:00Z", archivedAt: null, title: n % 2 ? "A title" : null,
    siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, metaSha: null, metaSince: null, fetchedAt: null, checkedAt: null, gone: false, fetchProblem: null, fetchAttempts: 0, companyIds: [], themeIds: [],
  });

  it("keeps the first eight and the total, the host without www, and the day in India", () => {
    const { lines, total } = conceptSourceLines(Array.from({ length: 10 }, (_, i) => record(i)));
    expect(total).toBe(10);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toMatchObject({ host: "example.org", savedOn: "2026-10-04", title: null });
  });

  it("never carries his private note", () => {
    expect(JSON.stringify(conceptSourceLines([record(1)]))).not.toContain("private");
  });
});
