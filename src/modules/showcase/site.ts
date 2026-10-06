import { istDate } from "@/lib/dates";
import type { TestCounts } from "@/lib/desk-types";
import { formatDate, formatFileNo } from "@/lib/format";
import { countStatuses } from "@/lib/test-status";
import type { HomeStats, RegisterFile, SiteChrome, StreakData, WhatChangedEntry } from "@/lib/view-types";
import { captureStreak, toStreakData } from "@/modules/capture";
import { buildKillTests, isIsoDate, readCaseFile, sentenceDiff, splitThesisBody } from "@/modules/casefile";
import type { PublicCompanyRow, PublicItemRow, PublicSnapshot } from "./types";

export type FileRow = { item: PublicItemRow & { fileNo: number; dataAsOf: string }; company: PublicCompanyRow };

/** Rule 3: a file has a number, a company and a readable dataAsOf; an item missing any of them is not shown as a file. */
export function files(s: PublicSnapshot): FileRow[] {
  return s.items
    .flatMap((item) => {
      const company = s.companies.find((c) => c.id === item.companyId);
      return (item.kind === "thesis" || item.kind === "case_study") && company && item.fileNo !== null && isIsoDate(item.dataAsOf)
        ? [{ item: { ...item, fileNo: item.fileNo, dataAsOf: item.dataAsOf }, company }]
        : [];
    })
    .sort((a, b) => a.item.fileNo - b.item.fileNo);
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
  return { counts: { files: files(s).length, notes: count("learning"), process: count("process"), mistakes: 0 }, streak: buildStreak(s) };
}

export function buildRegister(s: PublicSnapshot): RegisterFile[] {
  return files(s).map(({ item, company }) => ({
    fileNo: formatFileNo(item.fileNo), company: company.name, symbol: company.symbol, sector: company.sector,
    revNo: ordinal(s, item).revNo, revisedOn: istDate(item.revisedAt), tests: testCounts(item, s.today),
    dataAsOf: item.dataAsOf, href: `/companies/${company.slug}`,
  }));
}

export function buildWhatChanged(s: PublicSnapshot, limit = 5): WhatChangedEntry[] {
  const all = files(s);
  return [...s.revisions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((rev): WhatChangedEntry[] => {
      const item = s.items.find((i) => i.id === rev.itemId);
      if (!item) return [];
      const revs = revisionsOf(s, item.id);
      const n = revs.findIndex((r) => r.id === rev.id) + 1;
      const file = all.find((f) => f.item.id === item.id);
      const on = istDate(rev.createdAt);
      if (file) {
        const figures = `figures to ${formatDate(file.item.dataAsOf)}`;
        const subject = { label: file.company.name, href: `/companies/${file.company.slug}` };
        if (n === 1) {
          const tests = splitThesisBody(rev.bodyMd).conditions.length;
          return [{ on, kind: "new_file", fileNo: formatFileNo(file.item.fileNo), subject, text: rev.changeReason ?? "First version.", detail: `New file · ${tests} tests · ${figures}` }];
        }
        const changed = sentenceDiff(revs[n - 2].bodyMd, rev.bodyMd).reduce((sum, g) => sum + Math.max(g.removed.length, g.added.length), 0);
        return [{ on, kind: "revision", fileNo: formatFileNo(file.item.fileNo), subject, text: rev.changeReason ?? "Revised.", detail: `Revision R${n} · ${changed} sentences changed · ${figures}` }];
      }
      if (item.kind !== "learning" && item.kind !== "process") return [];
      const base = item.kind === "learning" ? "/notes" : "/process";
      const label = item.kind === "learning" ? "Learning note" : "Process note";
      return [{ on, kind: item.kind, fileNo: null, subject: { label: item.title, href: `${base}/${item.slug}` }, text: rev.changeReason ?? "First version.", detail: `${label} · R${n}` }];
    })
    .slice(0, limit);
}

export function buildHomeStats(s: PublicSnapshot): HomeStats {
  const all = files(s);
  const tests = all.map((f) => testCounts(f.item, s.today));
  const sum = (k: keyof TestCounts) => tests.reduce((t, c) => t + c[k], 0);
  const lastRevised = all.map((f) => istDate(f.item.revisedAt)).sort().at(-1) ?? null;
  return {
    files: all.length,
    sectors: new Set(all.map((f) => f.company.sector).filter(Boolean)).size,
    lastRevised,
    tests: { met: sum("met"), watching: sum("watching"), not_met: sum("not_met"), no_data: sum("no_data") },
    revisions: s.revisions.length,
    logged: buildStreak(s),
  };
}
