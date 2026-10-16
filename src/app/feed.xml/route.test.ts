import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivedProblems } from "@/modules/showcase";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";

const state = vi.hoisted(() => ({ snapshot: null as unknown }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => state.snapshot,
}));

import { GET, revalidate } from "./route";

beforeEach(() => {
  state.snapshot = { status: "ok", data: buildSeedSnapshot() };
});

describe("GET /feed.xml", () => {
  it("is refreshed hourly, through the same snapshot every publish and unpublish refreshes", () => {
    expect(revalidate).toBe(3600);
  });

  // Rule 11.5: an unpublished item leaves this surface with the public refresh, so it must read the one cached snapshot and keep no cache of its own.
  it("reads only the shared snapshot and has no cache of its own", () => {
    const source = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(source).toContain("getSnapshot");
    for (const own of ["unstable_cache", "fetch(", "force-static"]) expect(source).not.toContain(own);
  });

  it("serves the gated revisions as RSS", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    const xml = await res.text();
    expect(xml).toContain('<guid isPermaLink="false">/companies/kavpump#r2</guid>');
    expect(xml).toContain("<link>https://desk.example/companies/kavpump</link>");
  });

  it("with a case study whose chart is on, carries no id and no figure the feed added", async () => {
    state.snapshot = { status: "ok", data: buildRichSnapshot() };
    const xml = await (await GET()).text();
    expect(xml).toContain("/cases/lc1-a-closed-idea#r1");
    expect(derivedProblems(xml)).toEqual([]);
  });

  it("with the snapshot unavailable answers 503 and tells a reader to keep its last copy and try in an hour", async () => {
    state.snapshot = { status: "unavailable" };
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await res.text()).toBe("");
  });
});
