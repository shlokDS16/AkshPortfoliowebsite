import { istDate } from "@/lib/dates";
import { formatFileNo } from "@/lib/format";
import type { RevisionDiffData } from "@/lib/view-types";
import {
  buildExhibits, buildFactGroups, buildKillTests, buildScenario, buildSourceList, buildViewBlocks, fullTextOf, isLagged, readCaseFile, sentenceDiff,
  splitThesisBody,
} from "@/modules/casefile";
import { readingMinutes } from "./notes";
import { files, ordinal, revisionsOf } from "./site";
import type { FileView, PublicSnapshot, ShareCardModel } from "./types";

function fileFor(s: PublicSnapshot, companySlug: string) {
  const matches = files(s).filter((f) => f.company.slug === companySlug);
  return matches.find((f) => f.item.kind === "thesis") ?? matches[0] ?? null;
}

export function buildFileView(s: PublicSnapshot, companySlug: string): FileView | null {
  const found = fileFor(s, companySlug);
  if (!found) return null;
  const { item, company } = found;
  const fileNo = formatFileNo(item.fileNo);
  const revs = revisionsOf(s, item.id);
  const { revNo, revCount } = ordinal(s, item);
  const cf = readCaseFile(item.structured);
  const { viewMd, conditions } = splitThesisBody(item.bodyMd);
  const revisedOn = istDate(item.revisedAt);
  // Rule 1: the public audience, so a withheld reading is reported as no_data.
  const tests = buildKillTests(conditions, cf, s.today, revisedOn, "public");
  const current = revs[revNo - 1];
  const previous = revNo > 1 ? revs[revNo - 2] : undefined;
  const diff: RevisionDiffData | null =
    current && previous
      ? {
          from: { revNo: revNo - 1, on: istDate(previous.createdAt) },
          to: { revNo, on: istDate(current.createdAt) },
          reason: current.changeReason ?? "No reason recorded.",
          groups: sentenceDiff(previous.bodyMd, current.bodyMd),
          fullText: { [revNo - 1]: fullTextOf(previous.bodyMd), [revNo]: fullTextOf(current.bodyMd) },
        }
      : null;
  return {
    fileNo, companySlug: company.slug, company: company.name, symbol: company.symbol, sector: company.sector, oneLiner: cf.oneLiner,
    title: item.title, learningObjective: item.learningObjective ?? "", holdsPosition: item.holdsPosition ?? "not_disclosed",
    dataAsOf: item.dataAsOf, reviewedOn: revisedOn, revNo,
    dateline: { revNo, revCount, revisedOn, firstWrittenOn: istDate(revs[0]?.createdAt ?? item.publishedAt), dataAsOf: item.dataAsOf },
    readFirst: cf.readFirst.flatMap((slug) => {
      const note = s.items.find((i) => i.kind === "learning" && i.slug === slug);
      return note ? [{ title: note.title, href: `/notes/${slug}`, minutes: readingMinutes(note.bodyMd) }] : [];
    }),
    view: buildViewBlocks(viewMd, cf, s.today),
    tests,
    factGroups: buildFactGroups(cf, s.today),
    factCount: cf.facts.length,
    sources: buildSourceList(cf),
    exhibits: buildExhibits(fileNo, company.name, cf, s.today),
    // Rule 4: a scenario table is public only once the file's dataAsOf is 30 days old (IST), like every other figure.
    scenario: isLagged(item.dataAsOf, s.today) ? buildScenario(cf, revNo, item.dataAsOf) : null,
    diff,
    log: revs
      .slice(0, revNo)
      .map((r, i) => ({ revNo: i + 1, on: istDate(r.createdAt), reason: r.changeReason ?? (i === 0 ? "First version." : "No reason recorded.") }))
      .reverse(),
    sections: [
      { id: "view", label: "View" },
      { id: "tests", label: "Tests", count: tests.length },
      { id: "facts", label: "Facts", count: cf.facts.length },
      { id: "history", label: "History", count: `R${revNo}` },
    ],
  };
}

/** Segment 5: one fixed card per file; text only from linted fields (rule 8) plus fixed copy. */
export function buildShareCard(s: PublicSnapshot, companySlug: string): ShareCardModel | null {
  const found = fileFor(s, companySlug);
  if (!found) return null;
  return {
    fileNo: formatFileNo(found.item.fileNo), revNo: ordinal(s, found.item).revNo, company: found.company.name, title: found.item.title,
    learningObjective: found.item.learningObjective ?? "", revisedOn: istDate(found.item.revisedAt), dataAsOf: found.item.dataAsOf,
  };
}
