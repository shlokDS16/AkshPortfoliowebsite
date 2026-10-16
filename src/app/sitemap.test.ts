import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot, withLetter } from "@/test/fakes/showcase-snapshot";

const state = vi.hoisted(() => ({ snapshot: null as unknown }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => state.snapshot,
}));

import sitemap, * as route from "./sitemap";

beforeEach(() => {
  state.snapshot = { status: "ok", data: buildSeedSnapshot() };
});

describe("sitemap.xml", () => {
  it("is refreshed hourly with the other public pages", () => {
    expect(route.revalidate).toBe(3600);
  });

  // Rule 11.5: an unpublished item leaves this surface with the public refresh, so it must read the one cached snapshot and keep no cache of its own.
  it("reads only the shared snapshot and has no cache of its own", () => {
    const source = readFileSync(join(__dirname, "sitemap.ts"), "utf8");
    expect(source).toContain("getSnapshot");
    for (const own of ["unstable_cache", "fetch(", "force-static"]) expect(source).not.toContain(own);
  });

  it("at deploy: the static routes and the served pages, with no case, mistakes or concepts page (they 404 until published)", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.slice(0, 5)).toEqual(["https://desk.example/", "https://desk.example/companies", "https://desk.example/notes", "https://desk.example/process", "https://desk.example/about"]);
    expect(urls).toContain("https://desk.example/companies/kavpump");
    expect(urls.filter((u) => /\/(cases|mistakes|concepts)/.test(u))).toEqual([]);
  });

  it("lists a case and a concept once each is public", async () => {
    state.snapshot = { status: "ok", data: buildRichSnapshot() };
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(expect.arrayContaining(["https://desk.example/cases", "https://desk.example/cases/lc1-a-closed-idea", "https://desk.example/concepts/receivable-days"]));
  });

  it("lists the letters archive and each public letter, and drops them with the letter (Plan 5c)", async () => {
    state.snapshot = { status: "ok", data: withLetter(buildRichSnapshot()) };
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(expect.arrayContaining(["https://desk.example/letters", "https://desk.example/letters/l1-what-changed-this-fortnight"]));
    expect(urls.filter((u) => /\/letters\/(?:confirm|leave)/.test(u))).toEqual([]);
    state.snapshot = { status: "ok", data: buildRichSnapshot() };
    expect((await sitemap()).map((e) => e.url).filter((u) => u.includes("/letters"))).toEqual([]);
  });

  it("with the snapshot unavailable (a build without a database): the static routes only", async () => {
    state.snapshot = { status: "unavailable" };
    expect((await sitemap()).map((e) => e.url)).toHaveLength(5);
  });
});
