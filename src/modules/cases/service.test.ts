import { beforeEach, describe, expect, it } from "vitest";
import { ItemNotFoundError } from "@/lib/errors";
import { createFakeCases, type FakeCases } from "@/test/fakes/cases-repo";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { caseRecordFixture, FIXTURE_COMPANY, FIXTURE_IDEA } from "@/test/fixtures/case-record";
import { CASE_ERROR_TEXT, CaseError, caseErrorFromDb, type CaseErrorCode } from "./errors";
import { caseStateForIdea, caseSwitches, draftCaseStudy, recordDiffers, refreshCaseStudy } from "./service";
import type { CaseDeps } from "./types";
import { errorCode, errorText } from "@/lib/messages";
import { AccessDeniedError } from "@/lib/errors";
import { DbError } from "@/lib/supabase/errors";

const LIVE_COMPANY = "8a1f0f64-0000-4a00-8000-0000000000d2";

let research: MemoryResearchRepo;
let cases: FakeCases;
let deps: CaseDeps;
beforeEach(() => {
  research = createMemoryResearchRepo();
  cases = createFakeCases(research);
  deps = { cases, research };
});

describe("draftCaseStudy", () => {
  it("makes a private case study item with the record and the standard body headings, and sets Figures to", async () => {
    const result = await draftCaseStudy(deps, FIXTURE_IDEA);
    expect(result.created).toBe(true);
    const item = research.items.get(result.itemId)!;
    expect(item).toMatchObject({
      kind: "case_study", visibility: "private", status: "draft", slug: null, learningObjective: null, holdsPosition: null,
      title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026", dataAsOf: "2026-06-16", companyId: FIXTURE_COMPANY,
    });
    const revision = research.revisions.find((r) => r.itemId === item.id)!;
    expect(item.currentRevisionId).toBe(revision.id);
    expect(revision).toMatchObject({ bodyMd: "", changeReason: "Drafted from the ledger", author: "aksh" });
    // None of his words and none of the machine's are in the body: headings only.
    expect(revision.bodyMd.split("\n").filter((l) => l.trim() !== "").every((l) => l.startsWith("#"))).toBe(true);
    expect(revision.structured).toEqual({ ledger: cases.record });
  });

  it("copies the record the database built, value for value", async () => {
    cases.record = JSON.parse(JSON.stringify(caseRecordFixture({ chart: { points: [{ d: "2026-01-13", share: 100, index: 100 }, { d: "2026-06-16", share: 90.1, index: 104.7 }] } })));
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    expect(research.revisions.find((r) => r.itemId === itemId)!.structured).toEqual({ ledger: cases.record });
  });

  it("is idempotent: a second call returns the same item and makes nothing", async () => {
    const first = await draftCaseStudy(deps, FIXTURE_IDEA);
    const second = await draftCaseStudy(deps, FIXTURE_IDEA);
    expect(second).toEqual({ itemId: first.itemId, created: false });
    expect(research.items.size).toBe(1);
    expect(research.revisions).toHaveLength(1);
  });

  it("files the item under the company the sealed one was merged into", async () => {
    cases.aliases.set(FIXTURE_COMPANY, LIVE_COMPANY);
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    expect(research.items.get(itemId)?.companyId).toBe(LIVE_COMPANY);
  });

  it.each<[CaseErrorCode]>([["case-not-closed"], ["case-void"], ["case-no-lesson"], ["case-exit-pending"]])("makes nothing when the idea is not ready (%s)", async (code) => {
    cases.failure = code;
    await expect(draftCaseStudy(deps, FIXTURE_IDEA)).rejects.toMatchObject({ code });
    expect(research.items.size).toBe(0);
  });

  it("makes nothing from a record it cannot read", async () => {
    cases.record = { ...(cases.record as object), v: 2 };
    await expect(draftCaseStudy(deps, FIXTURE_IDEA)).rejects.toMatchObject({ code: "case-record-unreadable" });
    expect(research.items.size).toBe(0);
  });

  it("refuses an id that is not an idea id without asking the database", async () => {
    await expect(draftCaseStudy(deps, "nope")).rejects.toMatchObject({ code: "case-not-found" });
    expect(cases.built).toBe(0);
  });

  it("keeps a long company name inside the title limit", async () => {
    cases.record = { ...(cases.record as object), company: "A".repeat(400) };
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    expect(research.items.get(itemId)!.title.length).toBeLessThanOrEqual(200);
  });
});

describe("refreshCaseStudy", () => {
  const drafted = async () => (await draftCaseStudy(deps, FIXTURE_IDEA)).itemId;
  const ledgerChanged = () => {
    cases.record = JSON.parse(JSON.stringify(caseRecordFixture({ figures_to: "2026-07-20" })));
  };

  it("adds a revision with the rebuilt record and his words carried over, and moves Figures to", async () => {
    const id = await drafted();
    await research.insertRevision({ itemId: id, bodyMd: "Looking back, the signal was early.", structured: { ledger: cases.record }, changeReason: "wrote", author: "aksh" });
    ledgerChanged();
    const result = await refreshCaseStudy(deps, id);
    expect(result).toMatchObject({ changed: true, pendingGate: false });
    const latest = research.revisions.at(-1)!;
    expect(latest).toMatchObject({ bodyMd: "Looking back, the signal was early.", changeReason: "Refreshed from the ledger", author: "aksh" });
    expect(latest.structured).toEqual({ ledger: cases.record });
    expect(research.items.get(id)).toMatchObject({ dataAsOf: "2026-07-20", currentRevisionId: latest.id });
  });

  it("does nothing, and says so, when the record already matches", async () => {
    const id = await drafted();
    const before = research.revisions.length;
    expect(await refreshCaseStudy(deps, id)).toEqual({ changed: false, pendingGate: false });
    expect(research.revisions).toHaveLength(before);
  });

  it("moves a stale Figures to on a private item whose record already matches, and says it changed something", async () => {
    const id = await drafted();
    research.items.set(id, { ...research.items.get(id)!, dataAsOf: "2026-06-01" });
    expect(await refreshCaseStudy(deps, id)).toEqual({ changed: true, pendingGate: false });
    expect(research.items.get(id)?.dataAsOf).toBe("2026-06-16");
    expect(await refreshCaseStudy(deps, id)).toEqual({ changed: false, pendingGate: false });
  });

  it("on a public item stores the revision for the gate and leaves the frozen date alone", async () => {
    const id = await drafted();
    research.setVisibility(id, "public");
    ledgerChanged();
    const result = await refreshCaseStudy(deps, id);
    expect(result).toEqual({ changed: true, pendingGate: true });
    expect(research.items.get(id)?.dataAsOf).toBe("2026-06-16");
  });

  it("refuses an item that carries no ledger record, and an unknown item", async () => {
    const note = await research.insertItem({ kind: "case_study", title: "t", companyId: null, themeId: null, learningObjective: null });
    await research.insertRevision({ itemId: note.id, bodyMd: "", structured: {}, changeReason: null, author: "aksh" });
    await expect(refreshCaseStudy(deps, note.id)).rejects.toMatchObject({ code: "case-not-ledger" });
    await expect(refreshCaseStudy(deps, "8a1f0f64-0000-4a00-8000-00000000ffff")).rejects.toBeInstanceOf(ItemNotFoundError);
  });
});

describe("recordDiffers", () => {
  it("is false for a fresh draft, ignoring key order", async () => {
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    cases.record = Object.fromEntries(Object.entries(cases.record as object).reverse());
    expect(await recordDiffers(deps, itemId)).toBe(false);
  });

  it("is true after a word, a date or a listing changes in the ledger", async () => {
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    const changed = JSON.parse(JSON.stringify(cases.record)) as { events: { listed_on: string | null }[] };
    changed.events[0]!.listed_on = "2026-02-02";
    cases.record = changed;
    expect(await recordDiffers(deps, itemId)).toBe(true);
  });

  it("looks at the newest revision, including one waiting for the gate", async () => {
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    research.setVisibility(itemId, "public");
    const newer = { ...(cases.record as object), figures_to: "2026-07-20" };
    cases.record = newer;
    await research.insertRevision({ itemId, bodyMd: "", structured: { ledger: newer }, changeReason: "Refreshed from the ledger", author: "aksh" });
    expect(await recordDiffers(deps, itemId)).toBe(false);
  });
});

describe("caseStateForIdea", () => {
  it("says ready, with the earliest day it can be published (Figures to plus 30 days)", async () => {
    expect(await caseStateForIdea(deps, FIXTURE_IDEA)).toEqual({ state: "ready", figuresTo: "2026-06-16", earliest: "2026-07-16" });
  });

  it.each<[CaseErrorCode, string]>([["case-not-closed", "not_closed"], ["case-void", "void"], ["case-no-lesson", "no_lesson"], ["case-exit-pending", "exit_pending"]])(
    "maps %s to the state %s",
    async (code, state) => {
      cases.failure = code;
      expect(await caseStateForIdea(deps, FIXTURE_IDEA)).toEqual({ state });
    },
  );

  it("says draft, then public, once an item exists, without asking the database", async () => {
    const { itemId } = await draftCaseStudy(deps, FIXTURE_IDEA);
    const built = cases.built;
    expect(await caseStateForIdea(deps, FIXTURE_IDEA)).toEqual({ state: "draft", itemId });
    research.setVisibility(itemId, "public");
    expect(await caseStateForIdea(deps, FIXTURE_IDEA)).toEqual({ state: "public", itemId });
    expect(cases.built).toBe(built);
  });

  it("lets any other failure through", async () => {
    cases.buildRecord = async () => {
      throw new DbError("cases.test", "XX000", "boom");
    };
    await expect(caseStateForIdea(deps, FIXTURE_IDEA)).rejects.toBeInstanceOf(DbError);
  });
});

describe("caseSwitches", () => {
  it("reports what the database reads", async () => {
    cases.on = { reveal: true, chart: false };
    expect(await caseSwitches(deps)).toEqual({ reveal: true, chart: false });
  });
});

describe("the error messages", () => {
  it.each(Object.keys(CASE_ERROR_TEXT) as CaseErrorCode[])("%s shows as itself with the same text in messages.ts", (code) => {
    const error = new CaseError(code);
    expect(errorCode(error)).toBe(code);
    expect(errorText(code)).toBe(CASE_ERROR_TEXT[code]);
  });

  it.each([
    ["case:not_closed", "case-not-closed"],
    ["case:void", "case-void"],
    ["case:no_review", "case-no-lesson"],
    ["case:exit_pending", "case-exit-pending"],
  ])("%s from the database becomes %s", (message, code) => {
    const error = caseErrorFromDb("cases.test", { message, code: "P0001" });
    expect(error).toBeInstanceOf(CaseError);
    expect(errorCode(error)).toBe(code);
  });

  it("a caller who is not the admin is access denied; anything else stays a database error", () => {
    expect(caseErrorFromDb("cases.test", { message: "forbidden", code: "42501" })).toBeInstanceOf(AccessDeniedError);
    expect(caseErrorFromDb("cases.test", { message: "case:surprise", code: "P0001" })).toBeInstanceOf(DbError);
    expect(caseErrorFromDb("cases.test", { message: "x" })).toBeInstanceOf(DbError);
  });
});
