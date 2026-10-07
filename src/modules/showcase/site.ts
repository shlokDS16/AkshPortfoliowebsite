import { istDate } from "@/lib/dates";
import type { TestCounts } from "@/lib/desk-types";
import { formatDate, formatFileNo } from "@/lib/format";
import { countStatuses } from "@/lib/test-status";
import type { HomeStats, RegisterFile, SiteChrome, StreakData, WhatChangedEntry } from "@/lib/view-types";
import { captureStreak, toStreakData } from "@/modules/capture";
import { buildKillTests, isIsoDate, isLagged, readCaseFile, sentenceDiff, splitThesisBody } from "@/modules/casefile";
import type { PublicCompanyRow, PublicItemRow, PublicSnapshot } from "./types";

export type FileRow = { item: PublicItemRow & { fileNo: number; dataAsOf: string }; company: PublicCompanyRow };

/**
 * Rule 3: a file has a number, a company and a readable dataAsOf; an item missing any of them is not shown as a file.
 * Rules 3 and 4, defence in depth: public_items already applies the 30-day lag in SQL, but a file whose dataAsOf is
 * not 30 days old on `today` is dropped here too, so no figure, test or scenario of it can reach a page.
 */
export function files(s: PublicSnapshot): FileRow[] {
  return s.items
    .flatMap((item) => {
      const company = s.companies.find((c) => c.id === item.companyId);
      return (item.kind === "thesis" || item.kind === "case_study") && company && item.fileNo !== null && isIsoDate(item.dataAsOf) && isLagged(item.dataAsOf, s.today)
        ? [{ item: { ...item, fileNo: item.fileNo, dataAsOf: item.dataAsOf }, company }]
        : [];
    })
    .sort((a, b) => a.item.fileNo - b.item.fileNo);
}

/**
 * M4: what /companies/[slug] serves, one file per company: its thesis, else its lowest-numbered file. The register,
 * the Files counts and the home stats read this, so a company with a thesis and a case study is one row, not two
 * rows with the same href.
 */
export function servedFiles(s: PublicSnapshot): FileRow[] {
  const all = files(s);
  return all.filter((f) => f === (all.find((g) => g.company.id === f.company.id && g.item.kind === "thesis") ?? all.find((g) => g.company.id === f.company.id)));
}

export const revisionsOf = (s: PublicSnapshot, itemId: string) =>
  s.revisions.filter((r) => r.itemId === itemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** D11: the public R-number is the position among gated revisions. */
export function ordinal(s: PublicSnapshot, item: PublicItemRow): { revNo: number; revCount: number } {
  const revs = revisionsOf(s, item.id);
  const index = revs.findIndex((r) => r.id === item.revisionId);
  return { revNo: index >= 0 ? index + 1 : Math.max(1, revs.length), revCount: revs.length };
}

/** Rule 1: always the public audience, so a withheld reading counts as no_data, never as met or not met. */
export function testCounts(item: PublicItemRow, today: string): TestCounts {
  const { conditions } = splitThesisBody(item.bodyMd);
  return countStatuses(buildKillTests(conditions, readCaseFile(item.structured), today, istDate(item.revisedAt), "public").map((t) => t.status));
}

export function buildStreak(s: PublicSnapshot): StreakData {
  if (!isIsoDate(s.today)) throw new RangeError("today must be a YYYY-MM-DD date");
  return toStreakData(captureStreak(s.captureDays.filter(isIsoDate), s.today));
}

export function buildSiteChrome(s: PublicSnapshot): SiteChrome {
  const count = (kind: string) => s.items.filter((i) => i.kind === kind).length;
  return { counts: { files: servedFiles(s).length, notes: count("learning"), process: count("process"), mistakes: 0 }, streak: buildStreak(s) };
}

export function buildRegister(s: PublicSnapshot): RegisterFile[] {
  return servedFiles(s).map(({ item, company }) => ({
    fileNo: formatFileNo(item.fileNo), company: company.name, symbol: company.symbol, sector: company.sector,
    revNo: ordinal(s, item).revNo, revisedOn: istDate(item.revisedAt), tests: testCounts(item, s.today),
    dataAsOf: item.dataAsOf, href: `/companies/${company.slug}`,
  }));
}

function whatChangedEntry(s: PublicSnapshot, all: FileRow[], rev: PublicSnapshot["revisions"][number]): WhatChangedEntry | null {
  const item = s.items.find((i) => i.id === rev.itemId);
  if (!item) return null;
  const revs = revisionsOf(s, item.id);
  const n = revs.findIndex((r) => r.id === rev.id) + 1;
  const file = all.find((f) => f.item.id === item.id);
  const on = istDate(rev.createdAt);
  if (file) {
    const figures = `figures to ${formatDate(file.item.dataAsOf)}`;
    const subject = { label: file.company.name, href: `/companies/${file.company.slug}` };
    if (n === 1) {
      const tests = splitThesisBody(rev.bodyMd).conditions.length;
      return { on, kind: "new_file", fileNo: formatFileNo(file.item.fileNo), subject, text: rev.changeReason ?? "First version.", detail: `New file · ${tests} tests · ${figures}` };
    }
    const changed = sentenceDiff(revs[n - 2].bodyMd, rev.bodyMd).reduce((sum, g) => sum + Math.max(g.removed.length, g.added.length), 0);
    return { on, kind: "revision", fileNo: formatFileNo(file.item.fileNo), subject, text: rev.changeReason ?? "Revised.", detail: `Revision R${n} · ${changed} sentences changed · ${figures}` };
  }
  if (item.kind !== "learning" && item.kind !== "process") return null;
  const base = item.kind === "learning" ? "/notes" : "/process";
  const label = item.kind === "learning" ? "Learning note" : "Process note";
  return {
    on, kind: item.kind, fileNo: null, subject: { label: item.title, href: `${base}/${item.slug}` },
    text: rev.changeReason ?? (n === 1 ? "First version." : "Revised."), detail: `${label} · R${n}`,
  };
}

export function buildWhatChanged(s: PublicSnapshot, limit = 5): WhatChangedEntry[] {
  const all = files(s);
  const entries: WhatChangedEntry[] = [];
  // Newest first; stop as soon as `limit` entries exist so no sentence diff is computed for an older revision.
  for (const rev of [...s.revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (entries.length >= limit) break;
    const entry = whatChangedEntry(s, all, rev);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function buildHomeStats(s: PublicSnapshot): HomeStats {
  const all = servedFiles(s);
  const served = new Set(all.map((f) => f.item.id));
  const tests = all.map((f) => testCounts(f.item, s.today));
  const sum = (k: keyof TestCounts) => tests.reduce((t, c) => t + c[k], 0);
  const lastRevised = all.map((f) => istDate(f.item.revisedAt)).sort().at(-1) ?? null;
  return {
    files: all.length,
    sectors: new Set(all.map((f) => f.company.sector).filter(Boolean)).size,
    lastRevised,
    tests: { met: sum("met"), watching: sum("watching"), not_met: sum("not_met"), no_data: sum("no_data") },
    // M6: case-file revisions only, beside the file counts (note revisions are not counted).
    revisions: s.revisions.filter((r) => served.has(r.itemId)).length,
    logged: buildStreak(s),
  };
}
