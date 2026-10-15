import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSeedSnapshot, withConcepts } from "@/test/fakes/showcase-snapshot";

// The deploy state (D55): with no gated revision linking a public concept, /concepts and every /concepts/[slug] are a 404 and the file
// and note pages carry no line. Nothing a visitor can see changes until he publishes something linked.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false, notFound: 0 }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFound += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
}));

import FilePage from "../companies/[slug]/page";
import NotePage from "../notes/[slug]/page";
import ConceptsPage, * as index from "./page";
import ConceptRoute, * as concept from "./[slug]/page";

const seed = () => buildSeedSnapshot();
const world = () =>
  withConcepts(
    seed(),
    [{ id: "k1", slug: "capital-cycle", name: "Capital cycle" }, { id: "k2", slug: "idle", name: "Idle concept" }],
    [["i1", "r1b", "k1", 1], ["n0", "rn0", "k1", 1]],
  );
const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);
const route = (slug: string) => ConceptRoute({ params: Promise.resolve({ slug }) } as never);

beforeEach(() => {
  state.notFound = 0;
  state.unavailable = false;
});

describe("/concepts", () => {
  it("is a 404 while no public concept is linked by a public item, and is cached like the other public pages", async () => {
    state.snapshot = seed();
    await expect(ConceptsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = withConcepts(seed(), [{ id: "k1", slug: "capital-cycle", name: "Capital cycle" }], []);
    await expect(ConceptsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(index.revalidate).toBe(3600);
  });

  it("lists the linked public concepts, A to Z, and not a public concept nothing uses", async () => {
    state.snapshot = world();
    const out = await html(ConceptsPage());
    expect(out).toContain("<h1");
    expect(out).toContain("Concepts");
    expect(out).toContain("The ideas Aksh uses to read a business, each with the notes and files where it comes up.");
    expect(out).toContain('href="/concepts/capital-cycle"');
    expect(out).toContain("1 note · 1 file");
    expect(out).not.toContain("Idle concept");
  });

  it("says it is unavailable at build time when the snapshot is, never a 404", async () => {
    state.unavailable = true;
    state.snapshot = seed();
    expect(await html(ConceptsPage())).toContain("Concepts");
    expect(state.notFound).toBe(0);
  });

  it("is titled and described", () => {
    expect(index.metadata).toEqual({ title: "Concepts", description: "The ideas Aksh uses to read a business, each with the notes and files where it comes up." });
  });
});

describe("/concepts/[slug]", () => {
  it("is a 404 for every slug while nothing is public, for an unknown slug and for a public concept nothing uses; builds nothing ahead of time", async () => {
    state.snapshot = seed();
    await expect(route("capital-cycle")).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = world();
    await expect(route("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(route("idle")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await concept.generateStaticParams()).toEqual([]);
    expect(concept.revalidate).toBe(3600);
  });

  it("renders the concept from the snapshot only, with the standard disclosure", async () => {
    state.snapshot = world();
    const out = await html(route("capital-cycle"));
    expect(out).toContain("Capital cycle");
    expect(out).toContain("Notes and case files by Aksh Agrawal that use Capital cycle, newest first.");
    expect(out).toContain('href="/notes/how-to-read-receivable-days"');
    expect(out).toContain('href="/companies/kavpump"');
    expect(out).toContain("For learning");
    expect(out).toContain("not SEBI-registered");
  });

  it("has a title and a description from the concept, and none for an unknown slug", async () => {
    state.snapshot = world();
    const meta = (slug: string) => concept.generateMetadata({ params: Promise.resolve({ slug }) } as never);
    expect(await meta("capital-cycle")).toEqual({ title: "Capital cycle", description: "Notes and case files by Aksh Agrawal that use Capital cycle, newest first." });
    expect(await meta("nope")).toEqual({});
  });
});

describe("the pages that carry a Concepts line", () => {
  const file = () => FilePage({ params: Promise.resolve({ slug: "kavpump" }) } as never);
  const note = () => NotePage({ params: Promise.resolve({ slug: "how-to-read-receivable-days" }) } as never);

  it("show it only once a gated revision links a public concept", async () => {
    state.snapshot = seed();
    for (const page of [file, note]) expect(await html(page())).not.toContain("data-concept-line");
    state.snapshot = world();
    for (const page of [file, note]) {
      const out = await html(page());
      expect(out).toContain("data-concept-line");
      expect(out).toContain('href="/concepts/capital-cycle"');
    }
  });
});
