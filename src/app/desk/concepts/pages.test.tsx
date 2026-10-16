import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const conceptIndex = vi.fn();
const conceptPage = vi.fn();
const monthPage = vi.fn();
const requireAdmin = vi.fn(async () => ({ email: "admin@desk.test" }));

vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/modules/knowledge", () => ({
  createSupabaseKnowledgeDeps: () => ({}),
  conceptIndex: (...a: unknown[]) => conceptIndex(...a),
  conceptPage: (...a: unknown[]) => conceptPage(...a),
  monthPage: (...a: unknown[]) => monthPage(...a),
  screenedConceptRefs: async () => [],
}));
const listSources = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
vi.mock("@/modules/sources", () => ({ createSupabaseSourcesRepo: () => ({}), listSources: (...a: unknown[]) => listSources(...a) }));
vi.mock("@/modules/knowledge/actions", () => ({
  linkConceptsAction: vi.fn(),
  unlinkConceptsAction: vi.fn(),
  makePublicAction: vi.fn(),
  saveDescriptionAction: vi.fn(),
}));

import ConceptRoute from "./[slug]/page";
import ConceptsPage from "./page";
import LearnedPage from "../learned/page";

const none = Promise.resolve({});

describe("/desk/concepts", () => {
  it("checks the admin, titles the page, says what a concept is, and shows an error code as its sentence", async () => {
    conceptIndex.mockResolvedValueOnce([]);
    const html = renderToStaticMarkup(await ConceptsPage({ searchParams: Promise.resolve({ error: "concept-not-found" }) }));
    expect(requireAdmin).toHaveBeenCalled();
    expect(html).toContain("Concepts");
    expect(html).toContain("Every #name you write becomes a concept. Its page gathers your notes on it.");
    expect(html).toContain("This concept could not be found.");
    expect(html).toContain("No concepts yet. Write #name in a capture, for example #capital-cycle.");
  });

  it("an unknown error code shows nothing", async () => {
    conceptIndex.mockResolvedValueOnce([]);
    const html = renderToStaticMarkup(await ConceptsPage({ searchParams: Promise.resolve({ error: "<script>" }) }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('role="alert"');
  });
});

describe("/desk/concepts/[slug]", () => {
  it("is a 404 for a concept that is not there", async () => {
    conceptPage.mockResolvedValueOnce(null);
    await expect(ConceptRoute({ params: Promise.resolve({ slug: "nope" }), searchParams: none })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the concept with a notice", async () => {
    conceptPage.mockResolvedValueOnce({ concept: { id: "c1", slug: "moats", name: "Moats", status: "private", descriptionMd: null }, groups: [], related: [], suggestions: [] });
    const html = renderToStaticMarkup(await ConceptRoute({ params: Promise.resolve({ slug: "moats" }), searchParams: Promise.resolve({ notice: "concept-linked" }) }));
    expect(html).toContain("Moats");
    expect(html).toContain("Make public");
    expect(html).toContain("Linked.");
    expect(html).not.toContain("Sources");
  });

  it("lists the sources attached to the concept, asking for the id of this concept", async () => {
    conceptPage.mockResolvedValueOnce({ concept: { id: "c1", slug: "moats", name: "Moats", status: "private", descriptionMd: null }, groups: [], related: [], suggestions: [] });
    listSources.mockResolvedValueOnce([
      { id: "s1", url: "https://youtu.be/abcdefghijk", kind: "youtube", title: "A talk on moats", siteName: "Some Channel", createdAt: "2026-10-03T05:00:00Z", note: "private words" },
    ]);
    const html = renderToStaticMarkup(await ConceptRoute({ params: Promise.resolve({ slug: "moats" }), searchParams: none }));
    expect(listSources.mock.calls.at(-1)?.[1]).toEqual({ themeId: "c1" });
    expect(html).toContain("A talk on moats");
    expect(html).toContain("/desk/sources?concept=moats");
    expect(html).not.toContain("private words");
  });

  it("still renders the concept when the sources cannot be read", async () => {
    conceptPage.mockResolvedValueOnce({ concept: { id: "c1", slug: "moats", name: "Moats", status: "private", descriptionMd: null }, groups: [], related: [], suggestions: [] });
    listSources.mockRejectedValueOnce(new Error("boom"));
    const html = renderToStaticMarkup(await ConceptRoute({ params: Promise.resolve({ slug: "moats" }), searchParams: none }));
    expect(html).toContain("Moats");
  });
});

describe("/desk/learned", () => {
  const view = { month: "2026-10", prevMonth: "2026-09", nextMonth: null, learningCount: 0, readCount: 0, groups: [], reads: [] };

  it("takes the month from ?m=", async () => {
    monthPage.mockResolvedValueOnce(view);
    renderToStaticMarkup(await LearnedPage({ searchParams: Promise.resolve({ m: "2026-08" }) }));
    expect(monthPage.mock.calls.at(-1)?.[1]).toBe("2026-08");
  });

  it.each(["2026-13", "abc", "2026-8", ""])("reads %j as this month in India", async (raw) => {
    monthPage.mockResolvedValueOnce(view);
    renderToStaticMarkup(await LearnedPage({ searchParams: Promise.resolve({ m: raw }) }));
    expect(monthPage.mock.calls.at(-1)?.[1]).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(monthPage.mock.calls.at(-1)?.[1]).not.toBe(raw);
  });
});
