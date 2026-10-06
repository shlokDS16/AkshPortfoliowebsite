import type { PublishContext } from "./repo";
import type { LintInput } from "./rules";

/** The one mapping from stored rows to the lint's input. The gate (publish.ts) and the editor preview (preview.ts) both use it. */
export function buildLintInput(ctx: PublishContext, today: string): LintInput {
  const { item, revision } = ctx;
  return {
    revisionId: revision.id, kind: item.kind, title: item.title, slug: item.slug, learningObjective: item.learningObjective,
    bodyMd: revision.bodyMd, structured: revision.structured, changeReason: revision.changeReason,
    companyName: ctx.companyName, companyOneLiner: ctx.companyOneLiner, themeName: ctx.themeName,
    companyId: item.companyId, holdsPosition: item.holdsPosition, dataAsOf: item.dataAsOf,
    today, allowances: new Set(ctx.allowances),
  };
}
