import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SITE_POSITION, STANDARD_DISCLOSURE } from "@/components/desk/disclosure";
import { formatDate } from "@/lib/format";
import { buildRichSnapshot } from "@/test/fakes/showcase-snapshot";

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

import AboutPage from "./about/page";
import CasesPage from "./cases/page";
import FilesPage from "./companies/page";
import ConceptsPage from "./concepts/page";
import ConceptRoute from "./concepts/[slug]/page";
import MistakesPage from "./mistakes/page";
import NotesPage from "./notes/page";
import Home from "./page";
import ProcessPage from "./process/page";

// Rule 11.4: every printed public page carries the standard disclosure in full; /about already shows it on screen.
describe("index and concept pages print the full standard disclosure", () => {
  const rich = buildRichSnapshot();
  const full = STANDARD_DISCLOSURE(SITE_POSITION, formatDate(rich.today));
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) }) as never;
  const pages: [string, () => Promise<React.ReactNode>][] = [
    ["/", () => Home()],
    ["/companies", () => FilesPage()],
    ["/notes", () => NotesPage()],
    ["/process", () => ProcessPage()],
    ["/mistakes", () => MistakesPage()],
    ["/concepts", () => ConceptsPage()],
    ["/concepts/receivable-days", () => ConceptRoute(params("receivable-days"))],
    ["/cases", () => CasesPage()],
  ];

  it.each(pages)("%s has exactly one, with the whole sentence", async (_path, page) => {
    state.snapshot = rich;
    state.unavailable = false;
    const out = renderToStaticMarkup(await page());
    expect(out.match(/data-print-disclosure/g)).toHaveLength(1);
    expect(out.replaceAll("&#x27;", "'")).toContain(full.replaceAll("&", "&amp;"));
  });

  it("the unavailable state prints none, and /about adds none to the one it already shows", async () => {
    state.snapshot = rich;
    state.unavailable = true;
    expect(renderToStaticMarkup(await Home())).not.toContain("data-print-disclosure");
    state.unavailable = false;
    expect(renderToStaticMarkup(await AboutPage())).not.toContain("data-print-disclosure");
  });
});
