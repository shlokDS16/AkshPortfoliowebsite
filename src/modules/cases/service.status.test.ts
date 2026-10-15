import { beforeEach, describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createFakeCases, type FakeCases } from "@/test/fakes/cases-repo";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { caseRecordFixture, FIXTURE_IDEA } from "@/test/fixtures/case-record";
import { caseBlockFor, draftCaseStudy, ledgerStatus, refreshCaseStudy } from "./service";
import type { CaseDeps } from "./types";

let research: MemoryResearchRepo;
let cases: FakeCases;
let deps: CaseDeps;
beforeEach(() => {
  research = createMemoryResearchRepo();
  cases = createFakeCases(research);
  deps = { cases, research };
});

describe("ledgerStatus", () => {
  const drafted = async () => (await draftCaseStudy(deps, FIXTURE_IDEA)).itemId;
  const ledgerMoves = () => {
    cases.record = JSON.parse(JSON.stringify(caseRecordFixture({ figures_to: "2026-07-20" })));
  };

  it("is clean for a fresh draft", async () => {
    expect(await ledgerStatus(deps, await drafted())).toEqual({ differs: false, figuresTo: "2026-06-16", dateOut: false, frozen: false });
  });

  it("says the ledger changed, and a private item whose date is behind needs a refresh to move it", async () => {
    const id = await drafted();
    ledgerMoves();
    expect(await ledgerStatus(deps, id)).toEqual({ differs: true, figuresTo: "2026-07-20", dateOut: true, frozen: false });
  });

  it("on a public item whose ledger date moved: the date is frozen (the way out is Unpublish, Refresh, Publish)", async () => {
    const id = await drafted();
    research.setVisibility(id, "public");
    ledgerMoves();
    expect(await ledgerStatus(deps, id)).toEqual({ differs: true, figuresTo: "2026-07-20", dateOut: true, frozen: true });
  });

  it("on a public item whose ledger changed but whose date did not: refreshing works, nothing is frozen", async () => {
    const id = await drafted();
    research.setVisibility(id, "public");
    const changed = JSON.parse(JSON.stringify(cases.record)) as { events: { listed_on: string | null }[] };
    changed.events[0]!.listed_on = "2026-02-02";
    cases.record = changed;
    expect(await ledgerStatus(deps, id)).toEqual({ differs: true, figuresTo: "2026-06-16", dateOut: false, frozen: false });
  });

  it("stays frozen after a refresh stored a pending revision, until the item is unpublished", async () => {
    const id = await drafted();
    research.setVisibility(id, "public");
    ledgerMoves();
    await refreshCaseStudy(deps, id);
    expect(await ledgerStatus(deps, id)).toEqual({ differs: false, figuresTo: "2026-07-20", dateOut: true, frozen: true });
    research.setVisibility(id, "private");
    expect(await ledgerStatus(deps, id)).toMatchObject({ dateOut: true, frozen: false });
  });

  it("is null when the ledger cannot be read now, so the screen says nothing it cannot back", async () => {
    const id = await drafted();
    cases.failure = "case-record-unreadable";
    expect(await ledgerStatus(deps, id)).toBeNull();
  });
});

describe("caseBlockFor", () => {
  it("gives the state and the reveal switch together", async () => {
    cases.on = { reveal: true, chart: false };
    expect(await caseBlockFor(deps, FIXTURE_IDEA)).toEqual({
      state: { state: "ready", figuresTo: "2026-06-16", earliest: "2026-07-16" }, reveal: true,
    });
  });

  it("says nothing it cannot back: a database failure gives no state, and a switch that cannot be read is off", async () => {
    cases.buildRecord = async () => {
      throw new DbError("cases.test", "XX000", "boom");
    };
    cases.switches = async () => {
      throw new DbError("cases.test", "XX000", "boom");
    };
    expect(await caseBlockFor(deps, FIXTURE_IDEA)).toEqual({ state: null, reveal: false });
  });
});
