import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { bhavCsv, indexCsv } from "@/test/nse-files";
import { buildZip } from "@/test/zip-builder";
import { UPLOAD_LIMITS, UPLOAD_REFUSALS } from "@/modules/ledger/client";
import { uploadOfficialCloses, type UploadInput } from "./ledger-upload";

vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));

// Every refusal of the official-file upload, with hostile files built here in code (never a real NSE file: the repo is public
// and NSE forbids redistribution). The database is a double that records what was stored: every refusal must leave it empty.

type Stored = { name: string; args: Record<string, unknown> };
const DAY = "2026-10-12";
const TODAY = "2026-10-14";

function fakeDb(opts: { symbols?: string[]; store?: { message: string; code?: string }; trackedError?: boolean; score?: "ok" | "fail" } = {}) {
  const calls: Stored[] = [];
  const answer = (result: unknown) => {
    const builder = { abortSignal: () => builder, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return builder;
  };
  const db = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args: args ?? {} });
      if (name === "tracked_symbols") return answer(opts.trackedError ? { data: null, error: { message: "x", code: "XX000" } } : { data: opts.symbols ?? ["ALPHA", "BETA"], error: null });
      if (name === "store_uploaded_closes") return answer(opts.store ? { data: null, error: opts.store } : { data: (args?.p_rows as unknown[]).length, error: null });
      if (name === "score_ideas") return answer(opts.score === "fail" ? { data: null, error: { message: "boom", code: "XX000" } } : { data: 2, error: null });
      throw new Error(`unexpected rpc ${name}`);
    },
  } as unknown as Db;
  return { db, calls, stored: () => calls.filter((c) => c.name === "store_uploaded_closes") };
}

const enc = (text: string) => new TextEncoder().encode(text);
const zipOf = (csv: string) => buildZip([{ data: enc(csv) }]);
const good = (): UploadInput => ({
  date: DAY,
  zip: zipOf(bhavCsv([{ symbol: "ALPHA", close: "1234.50", isin: "INE111A01011" }, { symbol: "BETA", close: "88.05" }, { symbol: "OTHER", close: "10.00" }])),
  index: enc(indexCsv([{ name: "Nifty 50", close: "22363.35" }])),
});

let fake: ReturnType<typeof fakeDb>;
beforeEach(() => {
  fake = fakeDb();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
const run = (input: UploadInput, db = fake.db) => uploadOfficialCloses({ db, today: () => TODAY }, input);

/** The refusal and the proof that nothing reached the store. */
async function refused(input: UploadInput, db = fake, opts: { reachedStore?: boolean } = {}) {
  const result = await run(input, db.db);
  expect(result.ok).toBe(false);
  // A refusal by the file reaches no store call at all; a refusal by the database reached it once, and it stored nothing.
  expect(db.stored()).toHaveLength(opts.reachedStore ? 1 : 0);
  return result as Extract<Awaited<ReturnType<typeof run>>, { ok: false }>;
}

describe("a good official file", () => {
  it("stores only the tracked closes, through the upload door, with the Nifty 50 close, then scores", async () => {
    const result = await run(good());
    expect(result).toEqual({ ok: true, tradeDate: DAY, stored: 2, tracked: 2, indexStored: true, scored: 2 });
    expect(fake.stored()).toHaveLength(1);
    expect(fake.stored()[0]?.args).toEqual({
      p_trade_date: DAY,
      p_rows: [
        { symbol: "ALPHA", series: "EQ", isin: "INE111A01011", close: 1234.5 },
        { symbol: "BETA", series: "EQ", isin: "INE000A01010", close: 88.05 },
      ],
      p_index_close: 22363.35,
    });
    expect(fake.calls.map((c) => c.name)).toEqual(["tracked_symbols", "store_uploaded_closes", "score_ideas"]);
  });

  it("works without the index file, and says the Nifty 50 close was not stored", async () => {
    const result = await run({ ...good(), index: null });
    expect(result).toMatchObject({ ok: true, indexStored: false });
    expect(fake.stored()[0]?.args.p_index_close).toBeNull();
  });

  it("stands when scoring cannot run: the closes are stored and scored is null", async () => {
    fake = fakeDb({ score: "fail" });
    expect(await run(good())).toMatchObject({ ok: true, stored: 2, scored: null });
  });

  it("a symbol the file does not carry is simply absent", async () => {
    fake = fakeDb({ symbols: ["ALPHA", "BETA", "MISSING"] });
    expect(await run(good())).toMatchObject({ ok: true, stored: 2, tracked: 3 });
  });
});

describe("what is refused before anything is read", () => {
  it.each([
    ["no date", { date: "" }, "bad_date"],
    ["a date that is not a date", { date: "2026-02-30" }, "bad_date"],
    ["a date written another way", { date: "12-10-2026" }, "bad_date"],
    ["a date in the future", { date: "2026-10-15" }, "future_date"],
    ["an empty file in the zip box", { zip: new Uint8Array(0) }, "missing_zip"],
  ] as const)("%s", async (_name, change, code) => {
    expect((await refused({ ...good(), ...change })).code).toBe(code);
    expect(fake.calls).toEqual([]);
  });

  it("a zip over the limit, and an index file over the limit, say 'too large' without reading either", async () => {
    expect((await refused({ ...good(), zip: new Uint8Array(UPLOAD_LIMITS.zipBytes + 1) })).code).toBe("too_large");
    expect((await refused({ ...good(), index: new Uint8Array(UPLOAD_LIMITS.indexBytes + 1) })).code).toBe("too_large");
    expect(fake.calls).toEqual([]);
  });
});

describe("a file that is not what its name says (content is sniffed, never the name or type)", () => {
  it.each([
    ["a CSV in the zip box", enc(bhavCsv([{ symbol: "ALPHA" }]))],
    ["plain text", enc("hello")],
    ["a web page", enc("<html><body>blocked</body></html>")],
    ["a gzip", new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0])],
    ["a PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["three bytes", new Uint8Array([0x50, 0x4b, 0x03])],
  ])("%s is not a zip", async (_name, zip) => {
    expect((await refused({ ...good(), zip })).code).toBe("not_zip");
  });

  it("an index zip dropped in the index box is refused as a bad index file", async () => {
    expect((await refused({ ...good(), index: good().zip })).code).toBe("index_bad");
  });

  it("an index file that is not text", async () => {
    expect((await refused({ ...good(), index: new Uint8Array([0xff, 0xfe, 0xfd, 0x00, 0xc3, 0x28]) })).code).toBe("index_bad");
  });
});

describe("hostile zips", () => {
  it("a zip bomb: a small file that inflates past its declared size", async () => {
    const bomb = buildZip([{ data: enc("a".repeat(200_000)), declaredSize: 100 }]);
    expect((await refused({ ...good(), zip: bomb })).code).toBe("zip_damaged");
  });

  it("a zip whose entry declares more than the unzipped cap", async () => {
    const huge = buildZip([{ data: enc("a"), declaredSize: UPLOAD_LIMITS.unzippedBytes + 1 }]);
    expect((await refused({ ...good(), zip: huge })).code).toBe("zip_too_large");
  });

  it("more than one entry", async () => {
    const two = buildZip([{ data: enc(bhavCsv([{ symbol: "ALPHA" }])) }, { data: enc("second") }]);
    expect((await refused({ ...good(), zip: two })).code).toBe("zip_many");
  });

  it("an encrypted entry", async () => {
    const locked = buildZip([{ data: enc(bhavCsv([{ symbol: "ALPHA" }])), flags: 1 }]);
    expect((await refused({ ...good(), zip: locked })).code).toBe("zip_unsupported");
  });

  it("an unknown compression method and a zip64 marker", async () => {
    expect((await refused({ ...good(), zip: buildZip([{ data: enc("x"), method: 99 }]) })).code).toBe("zip_unsupported");
    expect((await refused({ ...good(), zip: buildZip([{ data: enc("x") }], { zip64Locator: true }) })).code).toBe("zip_unsupported");
  });

  it("a truncated zip, and a zip with a flipped byte (checksum)", async () => {
    const whole = good().zip;
    expect((await refused({ ...good(), zip: whole.subarray(0, whole.length - 30) })).code).toBe("zip_damaged");
    const flipped = Uint8Array.from(whole);
    flipped[50] = (flipped[50] ?? 0) ^ 0xff;
    expect((await refused({ ...good(), zip: flipped })).code).toBe("zip_damaged");
  });

  it("an entry name that is a path never matters: the name is not read", async () => {
    const sneaky = buildZip([{ name: "../../etc/passwd", data: enc(bhavCsv([{ symbol: "ALPHA" }])) }]);
    expect(await run({ ...good(), zip: sneaky })).toMatchObject({ ok: true });
  });

  it("a stream that inflates to something that is not text", async () => {
    const binary = buildZip([{ data: new Uint8Array([0xff, 0xfe, 0xfd, 0xc3, 0x28, 0xa0, 0xa1]) }]);
    expect((await refused({ ...good(), zip: binary })).code).toBe("not_text");
  });

  it("a deflate stream that is garbage", async () => {
    const lying = buildZip([{ data: enc("x"), rawCompressed: Uint8Array.from([1, 2, 3, 4, 5]) }]);
    expect((await refused({ ...good(), zip: lying })).code).toBe("zip_damaged");
  });
});

describe("hostile or wrong CSV inside a good zip", () => {
  const withCsv = (csv: string): UploadInput => ({ ...good(), zip: zipOf(csv) });

  it("a header that is not NSE's (a column missing, renamed, or repeated)", async () => {
    expect((await refused(withCsv("a,b,c\n1,2,3\n"))).code).toBe("bad_header");
    const noClose = ["TradDt", "Sgmt", "Src", "ISIN", "TckrSymb", "SctySrs"];
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA" }], { header: noClose })))).code).toBe("bad_header");
    const twice = ["TradDt", "Sgmt", "Src", "ISIN", "TckrSymb", "SctySrs", "ClsPric", "ClsPric"];
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA" }], { header: twice })))).code).toBe("bad_header");
  });

  it("an empty text, and a header with no rows", async () => {
    expect((await refused(withCsv(""))).code).toBe("bad_header");
    const header = bhavCsv([]);
    expect((await refused(withCsv(header))).code).toBe("empty_file");
  });

  it("a row with the wrong number of fields, and an unclosed quote", async () => {
    const cut = bhavCsv([{ symbol: "ALPHA" }, { symbol: "BETA" }]).replace(/\n$/, "").split("\n");
    cut[2] = (cut[2] as string).split(",").slice(0, 10).join(",");
    expect((await refused(withCsv(cut.join("\n") + "\n"))).code).toBe("bad_row");
    expect((await refused(withCsv(`${bhavCsv([{ symbol: "ALPHA" }])}"open,quote\n`))).code).toBe("bad_row");
  });

  it.each(["", "12x", "-5", "0", "1e3", "1,234.50", "NaN", "Infinity", "99999999999999"])(
    "a bad close %j on a company the desk tracks refuses the WHOLE file",
    async (close) => {
      const result = await refused(withCsv(bhavCsv([{ symbol: "ALPHA", close }, { symbol: "BETA", close: "88.05" }])));
      expect(result.code).toBe("bad_close");
    },
  );

  it("a bad close on a company nobody tracks does not matter", async () => {
    expect(await run(withCsv(bhavCsv([{ symbol: "ALPHA" }, { symbol: "BETA" }, { symbol: "ZZZ", close: "garbage" }])))).toMatchObject({ ok: true, stored: 2 });
  });

  it("the same company twice in one series", async () => {
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA" }, { symbol: "ALPHA" }])))).code).toBe("duplicate");
  });

  it("a file for another date than the one chosen says which date it is for", async () => {
    const other = withCsv(bhavCsv([{ symbol: "ALPHA", date: "2026-10-09" }, { symbol: "BETA", date: "2026-10-09" }]));
    expect(await refused(other)).toEqual({ ok: false, code: "wrong_date", fileDate: "2026-10-09" });
  });

  it("a file holding two dates, and a date that is not a date", async () => {
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA", date: DAY }, { symbol: "BETA", date: "2026-10-09" }])))).code).toBe("bad_file_date");
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA", date: "12/10/2026" }])))).code).toBe("bad_file_date");
  });

  it("more rows than a real file can have", async () => {
    const rows = Array.from({ length: 50_001 }, (_, i) => ({ symbol: `S${i}` }));
    expect((await refused(withCsv(bhavCsv(rows)))).code).toBe("too_many_rows");
  });

  it("a field of thousands of characters, and a row of hundreds of columns", async () => {
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA", name: "x".repeat(5000) }])))).code).toBe("too_many_rows");
    const wide = `${Array.from({ length: 300 }, (_, i) => `c${i}`).join(",")}\n`;
    expect((await refused(withCsv(wide))).code).toBe("too_many_rows");
  });

  it("control characters in an ISIN refuse the file", async () => {
    expect((await refused(withCsv(bhavCsv([{ symbol: "ALPHA", isin: "INE111\u0007A011" }])))).code).toBe("bad_row");
  });
});

describe("the index file", () => {
  const withIndex = (text: string): UploadInput => ({ ...good(), index: enc(text) });

  it("a header that is not NSE's index layout", async () => {
    expect((await refused(withIndex("a,b\n1,2\n"))).code).toBe("index_bad");
  });

  it("no Nifty 50 row, and a lookalike name", async () => {
    expect((await refused(withIndex(indexCsv([{ name: "Nifty Bank", close: "50000" }])))).code).toBe("index_no_nifty");
    expect((await refused(withIndex(indexCsv([{ name: "NIFTY 50", close: "22000" }])))).code).toBe("index_no_nifty");
  });

  it("the Nifty 50 twice, and a close that is not a number", async () => {
    expect((await refused(withIndex(indexCsv([{ name: "Nifty 50" }, { name: "Nifty 50" }])))).code).toBe("index_bad");
    expect((await refused(withIndex(indexCsv([{ name: "Nifty 50", close: "-" }])))).code).toBe("index_bad");
  });

  it("another date than the one chosen", async () => {
    expect(await refused(withIndex(indexCsv([{ name: "Nifty 50", date: "09-10-2026" }])))).toEqual({ ok: false, code: "index_wrong_date", fileDate: "2026-10-09" });
  });
});

describe("what the database says", () => {
  it("before the market has closed that day: 'too early'", async () => {
    fake = fakeDb({ store: { message: "ledger:future_date", code: "P0001" } });
    expect((await refused(good(), fake, { reachedStore: true })).code).toBe("too_early");
  });

  it("a day the job shut, uploaded without the index file: 'day shut'", async () => {
    fake = fakeDb({ store: { message: "ledger:day_shut", code: "P0001" } });
    expect((await refused({ ...good(), index: null }, fake, { reachedStore: true })).code).toBe("day_shut");
  });

  it("any other database failure is 'could not store', and the log holds the code only", async () => {
    fake = fakeDb({ store: { message: "secret row data 1234.50 ALPHA", code: "XX000" } });
    expect((await refused(good(), fake, { reachedStore: true })).code).toBe("store_failed");
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/secret|ALPHA|1234/);
  });

  it("a failure to read the tracked list stores nothing", async () => {
    fake = fakeDb({ trackedError: true });
    expect((await refused(good(), fake)).code).toBe("store_failed");
  });
});

describe("the closed list of refusals", () => {
  it("every code the function can return is in the list the page has words for", async () => {
    const seen = new Set<string>();
    const cases: UploadInput[] = [
      { ...good(), date: "" }, { ...good(), date: "2030-01-01" }, { ...good(), zip: new Uint8Array(0) }, { ...good(), zip: enc("x") },
      { ...good(), zip: zipOf("a,b\n1,2\n") }, { ...good(), zip: zipOf(bhavCsv([{ symbol: "ALPHA", close: "x" }])) },
    ];
    for (const input of cases) {
      const r = await run(input);
      if (!r.ok) seen.add(r.code);
    }
    for (const code of seen) expect(UPLOAD_REFUSALS).toContain(code);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
