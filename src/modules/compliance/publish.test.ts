import { describe, expect, it } from "vitest";
import { createFakeComplianceRepo } from "@/test/fakes/compliance-repo";
import { decisionFromRow } from "./decision";
import { sentenceHash } from "./hash";
import { POLICY_VERSION } from "./policy";
import { getLatestDecision, PublishContextNotFoundError, runPublishGate, type PublishContext } from "./publish";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const COMPANY = "6f1c2a8e-5d7b-4c1e-9a3f-2b8d7e6c5a41";

function context(patch: Partial<PublishContext["item"]> = {}, bodyMd = "Utilisation peaked in 2024.", rest: Partial<PublishContext> = {}): PublishContext {
  return {
    item: {
      id: ITEM,
      kind: "learning",
      title: "How Capex Cycles Turn",
      slug: null,
      learningObjective: "Recognise the late stage of a capex cycle.",
      companyId: null,
      holdsPosition: null,
      dataAsOf: null,
      visibility: "private",
      ...patch,
    },
    revision: { id: REV, bodyMd, structured: {}, changeReason: null },
    companyName: null,
    companyOneLiner: null,
    themeName: null,
    allowances: [],
    ...rest,
  };
}

const deps = (repo: ReturnType<typeof createFakeComplianceRepo>) => ({ repo, today: () => "2026-10-04" });

describe("runPublishGate", () => {
  it("lints the loaded revision and hands the server-computed result to publish_revision", async () => {
    const repo = createFakeComplianceRepo(context());
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(decision.verdict).toBe("pass");
    expect(repo.published).toHaveLength(1);
    expect(repo.published[0]).toMatchObject({ itemId: ITEM, revisionId: REV, policyVersion: POLICY_VERSION });
    expect(repo.published[0].lintResult).toMatchObject({ passed: true, revisionId: REV, policyVersion: POLICY_VERSION, findings: [] });
  });

  it("records a failed attempt and returns the rule and the exact sentence (spec s9)", async () => {
    const repo = createFakeComplianceRepo(context({}, "Utilisation peaked. You should buy the leader now."));
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures).toContainEqual(
      expect.objectContaining({ rule: "1", sentence: "You should buy the leader now.", field: "body", sentenceHash: sentenceHash("You should buy the leader now.") }),
    );
    expect(decision.failures[0].match).toEqual(expect.any(String));
    expect(repo.published).toHaveLength(1);
    expect((await getLatestDecision(repo, ITEM))?.verdict).toBe("fail");
  });

  it("lints every public surface it loads: change reason, company one-liner and theme", async () => {
    const ctx = context({ companyId: COMPANY, holdsPosition: "no" }, "Neutral.", {
      companyName: "Acme Ltd",
      companyOneLiner: "A stock to buy now.",
      themeName: "Accumulate on dips",
    });
    ctx.revision.changeReason = "Raising my target price after results.";
    const decision = await runPublishGate(deps(createFakeComplianceRepo(ctx)), ITEM, REV);
    const fields = decision.failures.filter((f) => f.rule === "1" || f.rule === "2").map((f) => f.field);
    expect(fields).toEqual(expect.arrayContaining(["changeReason", "companyOneLiner", "themeName"]));
  });

  it("applies the lint's date rules with the injected IST date", async () => {
    const ctx = context({ kind: "case_study", companyId: COMPANY, holdsPosition: "no", dataAsOf: "2026-09-25" }, "# What would prove me wrong\nNothing.");
    const decision = await runPublishGate(deps(createFakeComplianceRepo(ctx)), ITEM, REV);
    expect(decision.failures.map((f) => f.rule)).toContain("3");
  });

  it("applies the item's rule 1 sentence allowances", async () => {
    const sentence = "Why I avoid target prices.";
    const ctx = context({}, sentence, { allowances: [sentenceHash(sentence)] });
    const decision = await runPublishGate(deps(createFakeComplianceRepo(ctx)), ITEM, REV);
    expect(decision.verdict).toBe("pass");
    expect(decision.allowedBy).toEqual([expect.objectContaining({ rule: "1", sentence, match: expect.stringMatching(/target price/i) })]);
  });

  it("surfaces a slug failure from publish_revision unchanged (ruling R5): the service assigns no slug", async () => {
    const repo = createFakeComplianceRepo(context());
    repo.slugTaken = true;
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures).toEqual([
      {
        rule: "slug",
        message: "The slug how-capex-cycles-turn-0b6f3c is already used by another item; rename this item.",
        field: null,
        sentence: null,
        match: null,
        sentenceHash: null,
      },
    ]);
  });

  it("surfaces a newer-revision failure from publish_revision unchanged", async () => {
    const repo = createFakeComplianceRepo(context());
    repo.newerRevisionExists = true;
    const decision = await runPublishGate(deps(repo), ITEM, REV);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures).toEqual([
      { rule: "revision", message: "A newer revision exists; publish the latest.", field: null, sentence: null, match: null, sentenceHash: null },
    ]);
  });

  it("throws when the item or revision does not exist", async () => {
    const repo = createFakeComplianceRepo(null);
    await expect(runPublishGate(deps(repo), ITEM, REV)).rejects.toBeInstanceOf(PublishContextNotFoundError);
    expect(repo.published).toHaveLength(0);
  });

  it("reads back the latest decision, tagged with its revision, for the desk", async () => {
    const repo = createFakeComplianceRepo(context());
    expect(await getLatestDecision(repo, ITEM)).toBeNull();
    await runPublishGate(deps(repo), ITEM, REV);
    expect(await getLatestDecision(repo, ITEM)).toMatchObject({ verdict: "pass", revisionId: REV });
  });
});

describe("decisionFromRow", () => {
  const row = (reasons: unknown) => ({
    id: "d1",
    revision_id: REV,
    verdict: "fail",
    policy_version: POLICY_VERSION,
    decided_at: "2026-10-04T00:00:00Z",
    reasons: reasons as never,
  });

  it("drops SQL failures already explained by a lint finding", () => {
    const decision = decisionFromRow(
      row({
        failures: [
          { rule: "lint", message: "The text lint did not pass." },
          { rule: "6", message: "A learning objective is required." },
        ],
        lint: {
          findings: [{ rule: "6", field: "learningObjective", sentence: null, sentenceHash: null, match: null, message: "Add one." }],
          allowedBy: [],
        },
      }),
    );
    expect(decision.failures.map((f) => f.rule)).toEqual(["6"]);
  });

  it("hides a SQL failure only when the lint has the same whole-item finding for the same rule and field", () => {
    const sqlRule3 = { rule: "3", message: "A case study needs data_as_of at least 30 days old." };
    const sentenceRule3 = { rule: "3", field: "body", sentence: "It trades at Rs. 2,400.", sentenceHash: "c".repeat(64), match: "Rs. 2,400", message: "m" };
    const wholeItemRule3 = { rule: "3", field: null, sentence: null, sentenceHash: null, match: null, message: "n" };
    const shown = (findings: unknown[]) =>
      decisionFromRow(row({ failures: [sqlRule3], lint: { findings, allowedBy: [] } })).failures.map((f) => `${f.rule}:${f.field ?? "-"}:${f.sentence ? "sentence" : "item"}`);
    // A sentence-level rule 3 finding does not explain the SQL data-as-of failure: both are shown.
    expect(shown([sentenceRule3])).toEqual(["3:body:sentence", "3:-:item"]);
    // The lint's own whole-item rule 3 finding does.
    expect(shown([wholeItemRule3])).toEqual(["3:-:item"]);
    // Same rule on a different field does not.
    expect(shown([{ ...wholeItemRule3, field: "body" }])).toEqual(["3:body:item", "3:-:item"]);
  });

  it("never hides a SQL failure of a rule the lint does not model (slug, revision, company)", () => {
    const decision = decisionFromRow(
      row({
        failures: [
          { rule: "revision", message: "A newer revision exists; publish the latest." },
          { rule: "slug", message: "taken" },
        ],
        lint: { findings: [{ rule: "1", field: "body", sentence: "Buy.", sentenceHash: "a".repeat(64), match: "buy", message: "m" }], allowedBy: [] },
      }),
    );
    expect(decision.failures.map((f) => f.rule)).toEqual(["1", "revision", "slug"]);
  });

  it("keeps a revision-mismatch failure even when findings exist", () => {
    const decision = decisionFromRow(
      row({
        failures: [{ rule: "lint", message: "The lint result belongs to a different revision." }],
        lint: { findings: [{ rule: "1", field: "body", sentence: "Buy.", sentenceHash: "a".repeat(64), match: "buy", message: "m" }], allowedBy: [] },
      }),
    );
    expect(decision.failures.map((f) => f.rule)).toEqual(["1", "lint"]);
  });

  it("carries the revision and the allowances", () => {
    const hash = "b".repeat(64);
    const decision = decisionFromRow({
      ...row({ failures: [], lint: { findings: [], allowedBy: [{ rule: "1", field: "body", sentence: "Why I avoid target prices.", sentenceHash: hash, match: "target prices" }] } }),
      verdict: "pass",
    });
    expect(decision).toMatchObject({ decisionId: "d1", revisionId: REV, verdict: "pass", failures: [] });
    expect(decision.allowedBy).toHaveLength(1);
  });

  it("survives a malformed reasons payload by failing closed", () => {
    const decision = decisionFromRow({ ...row("oops"), verdict: "pass" });
    expect(decision.failures[0].rule).toBe("unknown");
    expect(decision.verdict).toBe("fail");
  });

  it("treats any verdict other than pass as a fail", () => {
    expect(decisionFromRow({ ...row({ failures: [], lint: {} }), verdict: "weird" }).verdict).toBe("fail");
  });
});
