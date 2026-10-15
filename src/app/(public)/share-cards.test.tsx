import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CARD } from "@/components/desk/share-card";
import { caseCard, conceptCard, noteCard, processCard } from "@/modules/showcase";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { NOTES, PROCESS_NOTE } from "@/test/fixtures/casefile";

// Plan 5a Task 2 (spec s4.4): a share card for a note, a process note, a case and a concept, built like the company card's.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/og", () => ({ ImageResponse: class { constructor(readonly element: { props: { c: unknown } }, readonly options: unknown) {} } }));
vi.mock("@/lib/og-fonts", () => ({ loadOgFonts: async () => [] }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
}));

import * as caseCardRoute from "./cases/[slug]/opengraph-image";
import * as conceptRoute from "./concepts/[slug]/opengraph-image";
import * as noteRoute from "./notes/[slug]/opengraph-image";
import * as processRoute from "./process/[slug]/opengraph-image";

type Route = {
  default: (p: { params: Promise<{ slug: string }> }) => Promise<unknown>;
  revalidate: number; generateStaticParams: () => Promise<unknown[]>; size: unknown; contentType: string; alt: string;
};
const run = async (r: Route, slug: string) => (await r.default({ params: Promise.resolve({ slug }) })) as { element: { props: { c: unknown } } };
const rich = buildRichSnapshot();

const routes: [string, Route, string, (slug: string) => unknown, boolean][] = [
  ["note", noteRoute, NOTES[0].slug, (s) => noteCard(rich, s), false],
  ["process note", processRoute, PROCESS_NOTE.slug, (s) => processCard(rich, s), false],
  ["case", caseCardRoute, "lc1-a-closed-idea", (s) => caseCard(rich, s), true],
  ["concept", conceptRoute, "receivable-days", (s) => conceptCard(rich, s), true],
];

beforeEach(() => {
  state.snapshot = rich;
  state.unavailable = false;
});

for (const [name, route, slug, expected, notYetPublic] of routes) {
  describe(`${name} share card`, () => {
    it("is 1200 by 630 PNG, regenerated hourly with the page, and builds nothing ahead of time", async () => {
      expect(route.size).toEqual({ width: 1200, height: 630 });
      expect(route.contentType).toBe("image/png");
      expect(route.revalidate).toBe(3600);
      expect(await route.generateStaticParams()).toEqual([]);
      expect(route.alt.length).toBeGreaterThan(20);
    });

    it("draws the card the builder gives, from the snapshot only", async () => {
      expect((await run(route, slug)).element.props.c).toEqual(expected(slug));
    });

    it("gives the site card with the snapshot down, and a 404 for an unknown slug, as the page does", async () => {
      await expect(run(route, "nope")).rejects.toThrow("NEXT_NOT_FOUND");
      state.unavailable = true;
      expect((await run(route, slug)).element.props.c).toEqual(HOME_CARD);
    });

    it("answers as its page does in the deploy state", async () => {
      state.snapshot = buildSeedSnapshot();
      if (notYetPublic) await expect(run(route, slug)).rejects.toThrow("NEXT_NOT_FOUND");
      else expect((await run(route, slug)).element.props.c).toEqual(expected(slug));
    });
  });
}
