import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { IMAGE_MAX_BYTES, POSTGREST_ROWS } from "@/modules/documents";
import { OCR_MAX_BYTES } from "./caps";
import { listedPages, readInboxPages, type InboxPageRow } from "./inbox-pages";

const row = (documentId: string, pageNo: number, over: Partial<InboxPageRow> = {}): InboxPageRow => ({
  document_id: documentId, page_no: pageNo, kind: null, basis: null, selected: false, selected_by: null, first_line: null, is_scan: true, ...over,
});

/** A stand-in for PostgREST that, like the real one, returns at most 1,000 rows a request. */
function pagedDb(rows: InboxPageRow[]) {
  const ranges: [number, number][] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    in: () => builder,
    or: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + POSTGREST_ROWS)), error: null });
    },
  };
  return { db: { from: () => builder } as unknown as Db, ranges };
}

describe("readInboxPages", () => {
  it("reads a long scanned report in ranges, so no scan page is lost behind the 1,000-row cap", async () => {
    const rows = Array.from({ length: 2_350 }, (_, i) => row("d1", i + 1));
    const { db, ranges } = pagedDb(rows);
    const out = await readInboxPages(db, ["d1"]);
    expect(out).toHaveLength(2_350);
    expect(out.at(-1)?.page_no).toBe(2_350);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once for a short read, and not at all for no documents", async () => {
    const { db, ranges } = pagedDb([row("d1", 1)]);
    expect(await readInboxPages(db, ["d1"])).toHaveLength(1);
    expect(ranges).toHaveLength(1);
    expect(await readInboxPages(db, [])).toEqual([]);
    expect(ranges).toHaveLength(1);
  });

  it("a read of exactly 1,000 rows asks once more to be sure there is no more", async () => {
    const { db, ranges } = pagedDb(Array.from({ length: 1_000 }, (_, i) => row("d1", i + 1)));
    expect(await readInboxPages(db, ["d1"])).toHaveLength(1_000);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe("listedPages", () => {
  it("lists the scan pages of a document that is only partly scanned, so Aksh can tick them", () => {
    const rows = [row("d1", 3, { is_scan: true, first_line: null }), row("d1", 7, { is_scan: false, kind: "pl", basis: "consolidated", first_line: "Statement of Profit and Loss\nrest" }), row("d1", 9)];
    expect(listedPages("pdf", rows)).toEqual([
      { pageNo: 3, kind: null, basis: null, firstLine: "", selected: false, by: null, scan: true, read: false },
      { pageNo: 7, kind: "pl", basis: "consolidated", firstLine: "Statement of Profit and Loss", selected: false, by: null, scan: false, read: false },
      { pageNo: 9, kind: null, basis: null, firstLine: "", selected: false, by: null, scan: true, read: false },
    ]);
  });

  it("marks the pages whose figures have been read, so Re-read is offered on those only", () => {
    const rows = [row("d1", 3, { first_line: null }), row("d1", 7, { kind: "pl", selected: true })];
    expect(listedPages("pdf", rows, new Set([7])).map((p) => [p.pageNo, p.read])).toEqual([[3, false], [7, true]]);
  });

  it("a photo is one page with nothing to tick", () => {
    expect(listedPages("image", [row("d1", 1)])).toEqual([]);
  });

  it("a voice note is one page of typed-out words with nothing to tick, even when it is short", () => {
    expect(listedPages("audio", [row("d1", 1, { is_scan: true })])).toEqual([]);
  });
});

describe("the photo size limit", () => {
  it("is the scan reader's 1 MB: the browser, the upload check and the reader agree", () => {
    expect(IMAGE_MAX_BYTES).toBe(OCR_MAX_BYTES);
  });
});
