import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { NOTES, PROCESS_NOTE } from "@/test/fixtures/casefile";

// Plan 5a Task 2: every public page names itself (metadata) and carries one structured-data script, both from the gated snapshot.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
}));

import AboutPage, * as about from "./about/page";
import CasesPage, * as cases from "./cases/page";
import CaseRoute, * as caseDetail from "./cases/[slug]/page";
import FilesPage, * as files from "./companies/page";
import FilePage, * as file from "./companies/[slug]/page";
import ConceptsPage, * as concepts from "./concepts/page";
import ConceptRoute, * as conceptDetail from "./concepts/[slug]/page";
import MistakesPage, * as mistakes from "./mistakes/page";
import NotesPage, * as notes from "./notes/page";
import NotePage, * as note from "./notes/[slug]/page";
import Home, * as home from "./page";
import ProcessPage, * as process from "./process/page";
import ProcessNotePage, * as processNote from "./process/[slug]/page";

const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);
const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never;
const scripts = (out: string) => [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as { "@type": string }[]);
const FEED = { "application/rss+xml": "/feed.xml" };

beforeEach(() => {
  state.snapshot = buildRichSnapshot();
  state.unavailable = false;
});

describe("index pages: static metadata with the canonical path, and one JSON-LD script", () => {
  const indexes: [string, { metadata?: unknown }, () => Promise<React.ReactNode>, string, string][] = [
    ["/", home, () => Home(), "/", "WebSite"],
    ["/companies", files, () => FilesPage(), "/companies", "CollectionPage"],
    ["/notes", notes, () => NotesPage(), "/notes", "CollectionPage"],
    ["/process", process, () => ProcessPage(), "/process", "CollectionPage"],
    ["/cases", cases, () => CasesPage(), "/cases", "CollectionPage"],
    ["/mistakes", mistakes, () => MistakesPage(), "/mistakes", "CollectionPage"],
    ["/concepts", concepts, () => ConceptsPage(), "/concepts", "CollectionPage"],
    ["/about", about, () => AboutPage(), "/about", "AboutPage"],
  ];
  for (const [name, mod, render, path, type] of indexes) {
    it(name, async () => {
      expect(mod.metadata).toMatchObject({ alternates: { canonical: path, types: FEED }, twitter: { card: "summary_large_image" } });
      const found = scripts(await html(render()));
      expect(found).toHaveLength(1);
      expect(found[0].map((n) => n["@type"])).toContain(type);
    });
  }
});

describe("detail pages: metadata from the snapshot, one JSON-LD script with the page's own url", () => {
  const detail: [string, (slug: string) => Promise<unknown>, (slug: string) => Promise<React.ReactNode>, string, string, string][] = [
    ["file", (s) => file.generateMetadata(params(s)), (s) => FilePage(params(s)), "kavpump", "/companies/kavpump", "Article"],
    ["note", (s) => note.generateMetadata(params(s)), (s) => NotePage(params(s)), NOTES[0].slug, `/notes/${NOTES[0].slug}`, "Article"],
    ["process note", (s) => processNote.generateMetadata(params(s)), (s) => ProcessNotePage(params(s)), PROCESS_NOTE.slug, `/process/${PROCESS_NOTE.slug}`, "Article"],
    ["case", (s) => caseDetail.generateMetadata(params(s)), (s) => CaseRoute(params(s)), "lc1-a-closed-idea", "/cases/lc1-a-closed-idea", "Article"],
    ["concept", (s) => conceptDetail.generateMetadata(params(s)), (s) => ConceptRoute(params(s)), "receivable-days", "/concepts/receivable-days", "DefinedTerm"],
  ];
  for (const [name, meta, render, slug, path, type] of detail) {
    it(name, async () => {
      expect(await meta(slug)).toMatchObject({ alternates: { canonical: path, types: FEED }, openGraph: { url: path } });
      const found = scripts(await html(render(slug)));
      expect(found).toHaveLength(1);
      expect(found[0].map((n) => n["@type"])).toEqual([type, "BreadcrumbList"]);
      expect(JSON.stringify(found)).toContain(`https://desk.example${path}`);
      expect(await meta("nope")).toEqual({});
      await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    });
  }
});

describe("the deploy state (nothing ledger, no concept): every page that exists still renders, and the others still 404", () => {
  beforeEach(() => {
    state.snapshot = buildSeedSnapshot();
  });

  it("renders the pages that were there, each with its script", async () => {
    for (const render of [() => Home(), () => FilesPage(), () => NotesPage(), () => ProcessPage(), () => MistakesPage(), () => AboutPage()]) expect(scripts(await html(render()))).toHaveLength(1);
  });

  it("keeps /cases and /concepts, and their detail pages, a 404", async () => {
    await expect(CasesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ConceptsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CaseRoute(params("lc1-a-closed-idea"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ConceptRoute(params("receivable-days"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await caseDetail.generateMetadata(params("lc1-a-closed-idea"))).toEqual({});
  });
});

describe("the snapshot unavailable (a build without a database)", () => {
  it("still names the index pages and writes no structured data for a page it cannot read", async () => {
    state.unavailable = true;
    expect(notes.metadata).toBeDefined();
    expect(scripts(await html(NotesPage()))).toHaveLength(0);
    expect(scripts(await html(FilePage(params("kavpump"))))).toHaveLength(0);
    expect(await file.generateMetadata(params("kavpump"))).toEqual({});
  });
});
