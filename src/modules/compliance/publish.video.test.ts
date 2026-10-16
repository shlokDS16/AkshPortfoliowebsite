import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeComplianceRepo } from "@/test/fakes/compliance-repo";
import { sentenceHash } from "./hash";
import { previewGate } from "./preview";
import { runPublishGate, type PublishContext } from "./publish";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function video(transcript: string | null, allowances: string[] = []): PublishContext {
  return {
    item: { id: ITEM, kind: "video", title: "How I read an annual report", slug: null, learningObjective: "See what each section is for.", companyId: null, holdsPosition: null, dataAsOf: null, visibility: "private" },
    revision: {
      id: REV,
      bodyMd: "A walk through the sections.",
      structured: { schema: "video/1", youtubeId: "dQw4w9WgXcQ", transcriptId: "t-1", transcriptSha: "x", chapters: [] },
      changeReason: null,
    },
    companyName: null, companyOneLiner: null, themeName: null, conceptNames: [], conceptSlugs: [], transcript, allowances,
  };
}
const deps = (repo: ReturnType<typeof createFakeComplianceRepo>) => ({ repo, gate: repo, actorId: ADMIN, today: () => "2026-10-16" });

describe("runPublishGate for a video (rule 12.2)", () => {
  it("hands the database the hash of exactly the transcript it linted", async () => {
    const transcript = "Hello world.\nSecond line here";
    const repo = createFakeComplianceRepo(video(transcript));
    await runPublishGate(deps(repo), ITEM, REV);
    expect(repo.published[0].lintResult).toMatchObject({ passed: true, transcriptSha: sha(transcript) });
  });

  it("records a spoken buy as a failure on the transcript, and a sentence allowance with a reason clears it", async () => {
    const transcript = "Intro.\nYou should buy this stock now.";
    const repo = createFakeComplianceRepo(video(transcript));
    const failed = await runPublishGate(deps(repo), ITEM, REV);
    expect(failed.verdict).toBe("fail");
    expect(failed.failures).toEqual([expect.objectContaining({ rule: "1", field: "transcript", sentence: "You should buy this stock now." })]);

    const allowed = createFakeComplianceRepo(video(transcript, [sentenceHash("You should buy this stock now.")]));
    const passed = await runPublishGate(deps(allowed), ITEM, REV);
    expect(passed.verdict).toBe("pass");
    expect(passed.allowedBy).toEqual([expect.objectContaining({ rule: "1", field: "transcript" })]);
  });

  it("sends no transcriptSha when the revision's transcript could not be loaded, so the database refuses it", async () => {
    const repo = createFakeComplianceRepo(video(null));
    await runPublishGate(deps(repo), ITEM, REV);
    expect("transcriptSha" in (repo.published[0].lintResult as object)).toBe(false);
  });

  it("the editor's preview lints the transcript too, so a flagged sentence shows before the press", () => {
    const preview = previewGate({ ctx: video("You should buy this stock now."), today: "2026-10-16", companyPublic: null, structureProblems: [] });
    expect(preview.lint.findings.map((f) => f.field)).toEqual(["transcript"]);
    expect(preview.items.find((i) => i.id === "rule-1")?.state).toBe("fail");
  });
});
