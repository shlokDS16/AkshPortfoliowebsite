import type { ChecklistItem } from "./preview";
import type { PublishContext } from "./repo";
import type { LintResult } from "./rules";

// The rule 14 rows of the publish checklist (Phase 5d, spec s13). Advisory, like the rest of the preview: the database gate decides. They exist only
// for a revision that lists outside sources.
const OUTSIDE_FIELDS = new Set(["outsideTitle", "outsideSite", "outsideLink"]);
const CHANGED = "YouTube or the page changed since you chose it. Save the sources again.";
const MISSING = "An outside source on this revision is missing. Save the sources again.";

export function outsideRows(ctx: PublishContext, lint: LintResult): ChecklistItem[] {
  const listed = Array.isArray(ctx.revision.structured.studied) ? ctx.revision.structured.studied.length : 0;
  if (listed === 0 && ctx.outside.length === 0) return [];
  // A title is shown only for an entry whose hash is the table's current one; the loader marks `read` exactly then.
  const changed = ctx.outside.some((s) => s.show && !s.read);
  const match: ChecklistItem = {
    id: "rule-14",
    name: "Outside sources match what you chose (rule 14).",
    state: ctx.outside.length < listed || changed ? "fail" : "pass",
    detail: ctx.outside.length < listed ? MISSING : changed ? CHANGED : "Each shown title is the one the desk read.",
  };
  const problems = lint.findings.filter((f) => OUTSIDE_FIELDS.has(f.field ?? ""));
  const words: ChecklistItem = {
    id: "rule-14-words",
    name: "Outside titles and links pass the wording check.",
    state: problems.length > 0 ? "fail" : "pass",
    detail: problems[0]?.message ?? "No wording problem in a shown title, name or link.",
  };
  return [match, words];
}
