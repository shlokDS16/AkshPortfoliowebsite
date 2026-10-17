import { describe, expect, it } from "vitest";
import { createFakeComplianceRepo } from "@/test/fakes/compliance-repo";
import { previewGate } from "./preview";
import { runPublishGate, type PublishContext } from "./publish";
import type { OutsideSource } from "./rules";

// Rule 14: the gate hands the database the hashes of the entries whose titles the lint read (`p_lint -> 'studied'`), and a flagged outside
// title is recorded as a failure on the right field, before the database is asked.
const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);
const source = (patch: Partial<OutsideSource> = {}): OutsideSource => ({ url: "https://example.com/talk", show: true, metaSha: SHA, read: true, title: "A talk on moats", siteName: "Some Channel", ...patch });

function thesis(outside: OutsideSource[]): PublishContext {
  return {
    item: { id: ITEM, kind: "thesis", title: "ACME thesis", slug: null, learningObjective: "See how one moat shows up.", companyId: "c-1", holdsPosition: "no", dataAsOf: "2026-08-01", visibility: "private" },
    revision: { id: REV, bodyMd: "Body.\n\n## What would prove me wrong\nIf margins fall.", structured: { schema: "casefile/1", studied: [{ link: "11111111-1111-4111-8111-111111111111", show: true, metaSha: SHA, note: "n" }] }, changeReason: null },
    companyName: "ACME Ltd", companyOneLiner: null, themeName: null, conceptNames: [], conceptSlugs: [], transcript: null, outside, allowances: [],
  };
}
const deps = (repo: ReturnType<typeof createFakeComplianceRepo>) => ({ repo, gate: repo, actorId: ADMIN, today: () => "2026-10-16" });

describe("runPublishGate for a file with outside sources (rule 14)", () => {
  it("sends the hash of each title the lint read in the lint result", async () => {
    const repo = createFakeComplianceRepo(thesis([source()]));
    await runPublishGate(deps(repo), ITEM, REV);
    expect(repo.published[0].lintResult).toMatchObject({ passed: true, studied: [SHA] });
  });

  it("sends no list when no title was read, so the database refuses a shown entry it cannot vouch for", async () => {
    const repo = createFakeComplianceRepo(thesis([source({ read: false, title: null, siteName: null })]));
    await runPublishGate(deps(repo), ITEM, REV);
    expect("studied" in (repo.published[0].lintResult as object)).toBe(false);
  });

  it("records a buy call in an outside title as a failure on that field, and a price as rule 3", async () => {
    const buy = await runPublishGate(deps(createFakeComplianceRepo(thesis([source({ title: "Five stocks to buy now" })]))), ITEM, REV);
    expect(buy.verdict).toBe("fail");
    expect(buy.failures).toEqual([expect.objectContaining({ rule: "1", field: "outsideTitle" })]);
    const price = await runPublishGate(deps(createFakeComplianceRepo(thesis([source({ title: "Trading at Rs 450 a share" })]))), ITEM, REV);
    expect(price.failures).toEqual([expect.objectContaining({ rule: "3", field: "outsideTitle" })]);
  });

  it("the editor's preview lints the outside texts too, so a flagged title shows before the press", () => {
    const preview = previewGate({ ctx: thesis([source({ title: "Five stocks to buy now" })]), today: "2026-10-16", companyPublic: null, structureProblems: [] });
    expect(preview.lint.findings.map((f) => f.field)).toEqual(["outsideTitle"]);
  });
});
