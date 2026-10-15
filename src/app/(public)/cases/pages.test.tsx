import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { caseRecordFixture } from "@/test/fixtures/case-record";
import { buildSeedSnapshot, withLedgerCase } from "@/test/fakes/showcase-snapshot";

// The deploy state (D37): with no ledger case study public, /cases is a 404 and /process has no record section. Nothing else moves.
const state = vi.hoisted(() => ({ snapshot: null as unknown, notFound: 0 }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFound += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => ({ status: "ok", data: state.snapshot }),
}));

import MistakesPage from "../mistakes/page";
import ProcessPage from "../process/page";
import CasesPage, * as casesIndex from "./page";
import CasePageRoute, * as casePage from "./[slug]/page";

const seed = () => buildSeedSnapshot();
const withCase = (patch: Parameters<typeof caseRecordFixture>[0] = {}) => withLedgerCase(seed(), caseRecordFixture(patch), { bodyMd: "Looking back, I would watch the monsoon earlier." });
const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);

beforeEach(() => {
  state.notFound = 0;
});

describe("/cases", () => {
  it("is a 404 while no ledger case study is public, and is cached like the other public pages", async () => {
    state.snapshot = seed();
    await expect(CasesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(casesIndex.revalidate).toBe(3600);
  });

  it("lists the published cases, newest publication first, once one is public", async () => {
    state.snapshot = withCase();
    const out = await html(CasesPage());
    expect(out).toContain("Closed cases");
    expect(out).toContain("/cases/lc1-a-closed-idea");
    expect(out).toContain("Closed Jun 2026");
    expect(state.notFound).toBe(0);
  });
});

describe("/cases/[slug]", () => {
  const run = (slug: string) => CasePageRoute({ params: Promise.resolve({ slug }) } as never);

  it("is a 404 for an unknown slug and for every slug while nothing is public; builds nothing ahead of time", async () => {
    state.snapshot = seed();
    await expect(run("lc1-a-closed-idea")).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = withCase();
    await expect(run("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await casePage.generateStaticParams()).toEqual([]);
    expect(casePage.revalidate).toBe(3600);
  });

  it("renders the case from the snapshot only: his words, the fingerprint check and the standard disclosure", async () => {
    state.snapshot = withCase();
    const out = await html(run("lc1-a-closed-idea"));
    expect(out).toContain("Seed demand looks steady and the balance sheet is clean.");
    expect(out).toContain("Check in this browser");
    expect(out).toContain("Educational content only.");
    expect(out).toContain("A past case, not a view on the share today.");
  });

  it("has a title and a description from the case, and none for an unknown slug", async () => {
    state.snapshot = withCase();
    const meta = (slug: string) => casePage.generateMetadata({ params: Promise.resolve({ slug }) } as never);
    expect(await meta("lc1-a-closed-idea")).toMatchObject({
      title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026", description: "How a margin story can fail while the demand story holds.",
    });
    expect(await meta("nope")).toEqual({});
  });
});

describe("/process", () => {
  it("has no 'How this record is kept' section until one ledger case study is public", async () => {
    state.snapshot = seed();
    const before = await html(ProcessPage());
    expect(before).not.toContain("How this record is kept");
    expect(before).not.toContain("/cases");
    state.snapshot = withCase();
    const after = await html(ProcessPage());
    expect(after).toContain("How this record is kept");
    expect(after).toContain("Read the closed cases");
  });
});

describe("/mistakes", () => {
  it("keeps its empty state until a case in which his own review named a mistake is public", async () => {
    state.snapshot = seed();
    const empty = await html(MistakesPage());
    expect(empty).toContain("Nothing here yet.");
    expect(empty).toContain("Closed cases in which Aksh judged his own process flawed, or named a kind of mistake, are listed here with his own words and a link to the case.");
    expect(empty).not.toMatch(/\bproves?\b|\bproof\b|\bverified\b/i);
    state.snapshot = withCase({ process: "sound", tags: ["luck"] });
    expect(await html(MistakesPage())).toContain("Nothing here yet.");
    state.snapshot = withCase();
    const out = await html(MistakesPage());
    expect(out).not.toContain("Nothing here yet.");
    expect(out).toContain("His call on his own process: flawed.");
    expect(out).toContain("/cases/lc1-a-closed-idea");
  });
});
