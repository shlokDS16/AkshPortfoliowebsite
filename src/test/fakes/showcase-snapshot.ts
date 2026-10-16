import { parseFactsSheet } from "@/modules/casefile/client";
import type { PublicConceptLink, PublicConceptRow, PublicItemRow, PublicRevisionRow, PublicSnapshot, PublicStudiedRow, PublicVideoRow } from "@/modules/showcase";
import { caseRecordFixture, FIXTURE_CHART } from "@/test/fixtures/case-record";
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
    // File 01: F1 was checked on the page its locator names (p. 131); F2 on p. 99 while its locator says p. 140 (moved
    // since); F3 on a page its locator matches; F4 never filed from a document. File 02's F1 must not leak to file 01.
    factChecks: [
      { itemId: "i1", factId: "F1", pageNo: 131 },
      { itemId: "i1", factId: "F2", pageNo: 99 },
      { itemId: "i1", factId: "F3", pageNo: 152 },
      { itemId: "i2", factId: "F1", pageNo: 44 },
    ],
    // Plan 4: the deploy state. No concept is public, so no page shows a concept line and /concepts is a 404.
    concepts: [],
    conceptLinks: [],
    today,
  };
}

/**
 * DEFENCE-IN-DEPTH fixture. Models a state the publish gate (rule 3a) makes impossible: figures dated after the
 * file's data_as_of (FY26 facts of 31 Mar 2026 against a Figures-to of 1 Mar 2026, with today 15 Apr 2026). It checks
 * that the public builders still mask a withheld figure if such a revision ever reached the database.
 */
export function buildFiguresAfterDataAsOfSnapshot(): PublicSnapshot {
  const s = buildSeedSnapshot("2026-04-15");
  return { ...s, items: s.items.map((i) => (i.fileNo !== null ? { ...i, dataAsOf: "2026-03-01" } : i)) };
}

/**
 * A published ledger case study (Plan 3b): the item carries no file number and its current revision is `{ ledger }` plus
 * a body. `record` is the ledger record as the database stored it. Never touches the seed's files or notes.
 */
export function withLedgerCase(snapshot: PublicSnapshot, record: unknown, patch: Partial<PublicItemRow> = {}): PublicSnapshot {
  const id = patch.id ?? "lc1";
  const revisionId = patch.revisionId ?? `${id}-rev`;
  const structured = patch.structured ?? { ledger: record };
  const publishedAt = patch.publishedAt ?? "2026-07-20T05:00:00Z";
  const item: PublicItemRow = {
    id, kind: "case_study", slug: `${id}-a-closed-idea`, title: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026", companyId: null,
    themeId: null, publishedAt, dataAsOf: "2026-06-16", learningObjective: "How a margin story can fail while the demand story holds.",
    holdsPosition: "no", revisionId, revNo: 1, bodyMd: "", structured, revisedAt: publishedAt, fileNo: null, ...patch,
  };
  const revision: PublicRevisionRow = { id: revisionId, itemId: id, revNo: 1, bodyMd: item.bodyMd, structured, changeReason: "Drafted from the ledger", createdAt: publishedAt };
  return { ...snapshot, items: [...snapshot.items, item], revisions: [...snapshot.revisions, revision] };
}

/** Plan 4: public concepts and their links, as public_themes and public_concept_links return them. `links` are [itemId, revisionId, conceptId, position]. */
export function withConcepts(snapshot: PublicSnapshot, concepts: PublicConceptRow[], links: [string, string, string, number][]): PublicSnapshot {
  const conceptLinks: PublicConceptLink[] = links.map(([itemId, revisionId, conceptId, position]) => ({ itemId, revisionId, conceptId, position }));
  return { ...snapshot, concepts: [...snapshot.concepts, ...concepts], conceptLinks: [...snapshot.conceptLinks, ...conceptLinks] };
}

/**
 * Phase 5a: every public kind at once, for the derived surfaces (metadata, JSON-LD, feed, sitemap). The seed's own text holds no figure
 * and no id, and the case carries a record whose chart is ON and whose ids are UUIDs, so anything of those in an output was added by a
 * builder. A concept links the first file, the first note and the case.
 */
export function buildRichSnapshot(): PublicSnapshot {
  const withCase = withLedgerCase(buildSeedSnapshot(), caseRecordFixture({ chart: FIXTURE_CHART }), { bodyMd: "Looking back, I would watch the monsoon earlier." });
  return withConcepts(withCase, [{ id: "cc1", slug: "receivable-days", name: "Receivable days" }], [["i1", "r1b", "cc1", 0], ["n0", "rn0", "cc1", 0], ["lc1", "lc1-rev", "cc1", 0]]);
}

/** The video fixtures: a listed video's id, his chapters and the transcript the anon view would return for it. */
export const VIDEO_ID = "dQw4w9WgXcQ";
export const VIDEO_CHAPTERS = [{ s: 0, title: "Why receivables" }, { s: 95, title: "Reading the ageing table" }, { s: 3725, title: "What to ask next" }];
export const VIDEO_SEGMENTS = [
  { s: 0, t: "Today we look at how receivables are reported." },
  { s: 30, t: "The ageing table is where the story starts." },
  { s: 3700, t: "So the question to carry away is who pays late." },
];

/**
 * Plan 5b: a listed video. The item carries no company by default; `patch` changes the item, `row` the public_videos row. Never touches
 * the seed's files or notes. The title and objective hold no figure and no id, so a derived surface that prints one added it.
 */
export function withVideo(snapshot: PublicSnapshot, patch: Partial<PublicItemRow> = {}, row: Partial<PublicVideoRow> = {}): PublicSnapshot {
  const id = patch.id ?? "v1";
  const revisionId = patch.revisionId ?? `${id}-rev`;
  const structured = patch.structured ?? { schema: "video/1", youtubeId: VIDEO_ID, transcriptId: "t-1", transcriptSha: "0".repeat(64), chapters: VIDEO_CHAPTERS };
  const publishedAt = patch.publishedAt ?? "2026-09-25T05:00:00Z";
  const item: PublicItemRow = {
    id, kind: "video", slug: `${id}-reading-the-ageing-table`, title: "Reading the ageing table", companyId: null, themeId: null, publishedAt, dataAsOf: null,
    learningObjective: "How to read who pays late.", holdsPosition: null, revisionId, revNo: 1, bodyMd: "I walk through one ageing table, line by line.", structured,
    revisedAt: publishedAt, fileNo: null, ...patch,
  };
  const revision: PublicRevisionRow = { id: revisionId, itemId: id, revNo: 1, bodyMd: item.bodyMd, structured, changeReason: "First version.", createdAt: publishedAt };
  const video: PublicVideoRow = { itemId: id, youtubeId: VIDEO_ID, durationSeconds: 3725, publishedAt: "2026-09-24T08:30:00+00:00", ...row };
  return { ...snapshot, items: [...snapshot.items, item], revisions: [...snapshot.revisions, revision], videos: [...(snapshot.videos ?? []), video] };
}

/** Plan 5c: the entries of a fixture letter. Each names a revision of the seed (r1b: the Kaveri file, rn0: the first learning note) and copies its words. */
export const LETTER_ENTRIES = [
  {
    revisionId: "r1b", kind: "file", path: "/companies/kavpump", revNo: 2, detail: "Revision R2 · 3 sentences changed · figures to 22 Aug 2026",
    title: "Kaveri Pumps", learningObjective: "How to read a pump maker.", changeReason: "Moved the receivable days test.", holdsPosition: "no", companyName: "Kaveri Pumps",
  },
  {
    revisionId: "rn0", kind: "learning", path: "/notes/how-to-read-receivable-days", revNo: 1, detail: "Learning note · R1",
    title: "How to read receivable days", learningObjective: "Why days matter.", changeReason: "First version.", holdsPosition: null, companyName: null,
  },
] as const;

/** Plan 5c: a published letter (no company, theme or data_as_of). `patch` changes the item; its revision follows. His note is the body. */
export function withLetter(snapshot: PublicSnapshot, patch: Partial<PublicItemRow> = {}, changeReason: string | null = "First version."): PublicSnapshot {
  const id = patch.id ?? "l1";
  const revisionId = patch.revisionId ?? `${id}-rev`;
  const structured = patch.structured ?? { schema: "letter/1", entries: LETTER_ENTRIES.map((e) => ({ ...e })) };
  const publishedAt = patch.publishedAt ?? "2026-09-28T05:00:00Z";
  const item: PublicItemRow = {
    id, kind: "letter", slug: `${id}-what-changed-this-fortnight`, title: "What changed this fortnight", companyId: null, themeId: null, publishedAt, dataAsOf: null,
    learningObjective: "Two pages changed and one test moved.", holdsPosition: null, revisionId, revNo: 1, bodyMd: "Two things this time.\n\nThe first line of the second paragraph\nand its second line.",
    structured, revisedAt: publishedAt, fileNo: null, ...patch,
  };
  const revision: PublicRevisionRow = { id: revisionId, itemId: id, revNo: item.revNo, bodyMd: item.bodyMd, structured, changeReason, createdAt: item.revisedAt };
  return { ...snapshot, items: [...snapshot.items, item], revisions: [...snapshot.revisions, revision] };
}

/** Phase 5d: a snapshot whose Kaveri file (item i1) lists outside sources, as the anon view would return them. Titles and notes hold no figure and no id. */
export const STUDIED_HASH = "b".repeat(64);
export function withStudied(snapshot: PublicSnapshot, rows: Partial<PublicStudiedRow>[] = [{}]): PublicSnapshot {
  const defaults: PublicStudiedRow = {
    itemId: "i1", position: 1, kind: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", savedOn: "2026-10-03", note: "Worth watching for how the dealer book is described.",
    title: "How a pump maker finances its dealers", siteName: "Dealer Finance Channel", channelUrl: "https://www.youtube.com/@dealerfinance",
    thumbPath: `yt/${STUDIED_HASH}.jpg`, thumbSha256: STUDIED_HASH,
  };
  return { ...snapshot, studied: rows.map((r, i) => ({ ...defaults, position: i + 1, ...r })) };
}
