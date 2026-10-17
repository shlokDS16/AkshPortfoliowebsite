import { GONE_TEXT, PROBLEM_TEXT, type SourceRecord } from "@/modules/sources/client";

// The status of a saved source, in words (spec s6.5): "Reading the link", a problem sentence, "Private", "On the public file". The sentences are the
// module's fixed ones (pending Shlok's approval); this file only chooses between them.
export type SourceStatus = {
  visibility: "Private" | "On the public file" | "Archived";
  detail: { text: string; tone: "plain" | "warn" } | null;
};

export function sourceStatus(r: Pick<SourceRecord, "gone" | "fetchProblem" | "fetchedAt" | "archivedAt">, onPublicFile: boolean): SourceStatus {
  if (r.archivedAt !== null) return { visibility: "Archived", detail: null };
  const visibility = onPublicFile ? "On the public file" : "Private";
  if (r.gone) return { visibility, detail: { text: GONE_TEXT, tone: "warn" } };
  if (r.fetchProblem !== null) return { visibility, detail: { text: PROBLEM_TEXT[r.fetchProblem], tone: "warn" } };
  if (r.fetchedAt === null) return { visibility, detail: { text: "Reading the link", tone: "plain" } };
  return { visibility, detail: null };
}
