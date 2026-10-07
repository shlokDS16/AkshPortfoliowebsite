import { istDate } from "@/lib/dates";
import type { CaptureListEntry } from "./types";

export type TodayGroup = { key: string; label: string; entries: CaptureListEntry[] };

/** Spec s5: the desk home shows today's captures grouped by company. */
export function groupTodayByCompany(entries: CaptureListEntry[], today: string): TodayGroup[] {
  const groups = new Map<string, TodayGroup>();
  for (const entry of entries) {
    if (istDate(entry.createdAt) !== today) continue;
    const key = entry.companyId ?? "none";
    const group = groups.get(key) ?? { key, label: entry.companySymbol ?? entry.companyName ?? "No company", entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    return a.label.localeCompare(b.label);
  });
}
