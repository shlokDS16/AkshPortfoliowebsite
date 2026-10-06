import { istDate } from "@/lib/dates";
import { formatFileNo } from "@/lib/format";
import type { UsedInRow } from "@/lib/view-types";
import { buildViewBlocks, isIsoDate, readCaseFile } from "@/modules/casefile";
import { files, ordinal, revisionsOf } from "./site";
import type { NoteKind, NoteSummary, NoteView, PublicSnapshot } from "./types";

export function readingMinutes(md: string): number {
  return Math.max(1, Math.ceil(md.split(/\s+/).filter(Boolean).length / 200));
}

const base = (kind: NoteKind) => (kind === "learning" ? "/notes" : "/process");

export function listNoteSummaries(s: PublicSnapshot, kind: NoteKind): NoteSummary[] {
  return s.items
    .filter((i) => i.kind === kind)
    .sort((a, b) => b.revisedAt.localeCompare(a.revisedAt))
    .map((i) => ({ slug: i.slug, title: i.title, learningObjective: i.learningObjective ?? "", revisedOn: istDate(i.revisedAt), minutes: readingMinutes(i.bodyMd), href: `${base(kind)}/${i.slug}` }));
}

/** D25: files that list the note under Read first now, dated from their first gated revision that did. */
function usedIn(s: PublicSnapshot, slug: string): UsedInRow[] {
  return files(s).flatMap(({ item, company }) => {
    if (!readCaseFile(item.structured).readFirst.includes(slug)) return [];
    const first = revisionsOf(s, item.id).find((r) => readCaseFile(r.structured).readFirst.includes(slug));
    return [{ fileNo: formatFileNo(item.fileNo), company: company.name, where: "Read first", href: `/companies/${company.slug}`, since: istDate(first ? first.createdAt : item.revisedAt) }];
  });
}

export function buildNoteView(s: PublicSnapshot, kind: NoteKind, slug: string): NoteView | null {
  const item = s.items.find((i) => i.kind === kind && i.slug === slug);
  if (!item) return null;
  const revs = revisionsOf(s, item.id);
  const { revNo, revCount } = ordinal(s, item);
  return {
    kind, slug, title: item.title, learningObjective: item.learningObjective ?? "", revisedOn: istDate(item.revisedAt),
    firstWrittenOn: istDate(revs[0]?.createdAt ?? item.publishedAt), revNo, revCount,
    body: buildViewBlocks(item.bodyMd, readCaseFile(item.structured), s.today),
    usedIn: kind === "learning" ? usedIn(s, slug) : [], minutes: readingMinutes(item.bodyMd),
    holdsPosition: item.companyId ? item.holdsPosition : null, dataAsOf: isIsoDate(item.dataAsOf) ? item.dataAsOf : null,
  };
}
