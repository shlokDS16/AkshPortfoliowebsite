import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { buildLintInput, lintText, type PublishContext } from "@/modules/compliance";
import type { HoldsPosition, ItemKind } from "@/modules/research";
import { KAVERI, NOTES, PROCESS_NOTE, SAHYADRI } from "@/test/fixtures/casefile";
import { checkCaseFile } from "./check";
import { parseFactsSheet } from "./sheet";

const TODAY = "2026-10-06";

const ctxFor = (o: {
  kind: ItemKind; title: string; learningObjective: string; bodyMd: string; structured: Record<string, unknown>;
  changeReason: string; companyId: string | null; companyName: string | null; holdsPosition: HoldsPosition | null; dataAsOf: string | null;
}): PublishContext => ({
  item: {
    id: "00000000-0000-4000-8000-0000000000aa", kind: o.kind, title: o.title, slug: null, learningObjective: o.learningObjective,
    companyId: o.companyId, holdsPosition: o.holdsPosition, dataAsOf: o.dataAsOf, visibility: "private",
  },
  revision: { id: "00000000-0000-4000-8000-0000000000bb", bodyMd: o.bodyMd, structured: o.structured, changeReason: o.changeReason },
  companyName: o.companyName, companyOneLiner: null, themeName: null, allowances: [],
});

describe("seed content passes the gate before the UI ever sees it", () => {
  it.each([KAVERI, SAHYADRI].flatMap((f) => f.revisions.map((r, i) => [`${f.symbol} R${i + 1}`, f, r] as const)))("%s", (_name, file, rev) => {
    const { caseFile, errors } = parseFactsSheet(rev.sheet);
    expect(errors).toEqual([]);
    expect(checkCaseFile(rev.bodyMd, caseFile)).toEqual([]);
    const ctx = ctxFor({
      kind: "thesis", title: file.title, learningObjective: file.learningObjective, bodyMd: rev.bodyMd, structured: caseFile,
      changeReason: rev.reason, companyId: "00000000-0000-4000-8000-000000000001", companyName: file.name,
      holdsPosition: "no", dataAsOf: addDays(TODAY, -45),
    });
    expect(lintText(buildLintInput(ctx, TODAY)).findings).toEqual([]);
  });

  it.each([...NOTES, PROCESS_NOTE].map((n) => [n.slug, n] as const))("%s", (_slug, note) => {
    const ctx = ctxFor({
      kind: note.kind, title: note.title, learningObjective: note.learningObjective, bodyMd: note.bodyMd, structured: {},
      changeReason: note.reason, companyId: null, companyName: null, holdsPosition: null, dataAsOf: null,
    });
    expect(lintText(buildLintInput(ctx, TODAY)).findings).toEqual([]);
  });
});
