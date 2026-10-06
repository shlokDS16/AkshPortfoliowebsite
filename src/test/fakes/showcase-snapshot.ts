import { parseFactsSheet } from "@/modules/casefile/client";
import type { PublicItemRow, PublicRevisionRow, PublicSnapshot } from "@/modules/showcase";
import { KAVERI, NOTES, PROCESS_NOTE, SAHYADRI } from "@/test/fixtures/casefile";

const cf = (sheet: string) => parseFactsSheet(sheet).caseFile;

export function buildSeedSnapshot(today = "2026-10-06"): PublicSnapshot {
  const revisions: PublicRevisionRow[] = [
    { id: "r1a", itemId: "i1", revNo: 1, bodyMd: KAVERI.revisions[0].bodyMd, structured: cf(KAVERI.revisions[0].sheet), changeReason: "First version.", createdAt: "2026-08-05T05:00:00Z" },
    // revNo 3: a private draft (revNo 2) never passed the gate, so it is not public (D11).
    { id: "r1b", itemId: "i1", revNo: 3, bodyMd: KAVERI.revisions[1].bodyMd, structured: cf(KAVERI.revisions[1].sheet), changeReason: KAVERI.revisions[1].reason, createdAt: "2026-08-20T05:00:00Z" },
    { id: "r2a", itemId: "i2", revNo: 1, bodyMd: SAHYADRI.revisions[0].bodyMd, structured: cf(SAHYADRI.revisions[0].sheet), changeReason: "First version.", createdAt: "2026-08-12T05:00:00Z" },
    ...[...NOTES, PROCESS_NOTE].map((n, i) => ({ id: `rn${i}`, itemId: `n${i}`, revNo: 1, bodyMd: n.bodyMd, structured: {}, changeReason: n.reason, createdAt: `2026-08-0${i + 1}T05:00:00Z` })),
  ];
  const file = (id: string, companyId: string, seed: typeof KAVERI, revisionId: string, revNo: number, fileNo: number): PublicItemRow => {
    const rev = revisions.find((r) => r.id === revisionId)!;
    return {
      id, kind: "thesis", slug: `${seed.symbol.toLowerCase()}-thesis`, title: seed.title, companyId, themeId: null,
      publishedAt: revisions.find((r) => r.itemId === id)!.createdAt, dataAsOf: "2026-08-22", learningObjective: seed.learningObjective,
      holdsPosition: "no", revisionId, revNo, bodyMd: rev.bodyMd, structured: rev.structured, revisedAt: rev.createdAt, fileNo,
    };
  };
  const items: PublicItemRow[] = [
    file("i1", "c1", KAVERI, "r1b", 3, 1),
    file("i2", "c2", SAHYADRI, "r2a", 1, 2),
    ...[...NOTES, PROCESS_NOTE].map((n, i): PublicItemRow => ({
      id: `n${i}`, kind: n.kind, slug: n.slug, title: n.title, companyId: null, themeId: null, publishedAt: `2026-08-0${i + 1}T05:00:00Z`,
      dataAsOf: null, learningObjective: n.learningObjective, holdsPosition: null, revisionId: `rn${i}`, revNo: 1, bodyMd: n.bodyMd,
      structured: {}, revisedAt: `2026-08-0${i + 1}T05:00:00Z`, fileNo: null,
    })),
  ];
  return {
    items,
    revisions,
    companies: [
      { id: "c1", slug: "kavpump", name: KAVERI.name, symbol: KAVERI.symbol, sector: KAVERI.sector },
      { id: "c2", slug: "sahcold", name: SAHYADRI.name, symbol: SAHYADRI.symbol, sector: SAHYADRI.sector },
    ],
    captureDays: ["2026-10-05", "2026-10-04", "2026-10-01", "2026-09-20"],
    today,
  };
}
