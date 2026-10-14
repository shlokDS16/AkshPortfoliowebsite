import { describe, expect, it } from "vitest";
import { BHAVCOPY_HEADER, bhavCsv, INDEX_HEADER, indexCsv } from "@/test/nse-files";
import { CsvError, MAX_FIELD_CHARS, MAX_FIELDS_PER_ROW, MAX_ROWS, parseBhavcopyCsv, parseCsvRows, parseIndexCsv } from "./nse-csv";

function refusal(fn: () => unknown): CsvError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CsvError);
    return error as CsvError;
  }
  throw new Error("expected a CsvError");
}

describe("parseBhavcopyCsv: a good day", () => {
  const csv = bhavCsv([
    { symbol: "ALPHA", close: "1234.50", isin: "INE111A01011" },
    { symbol: "BETA", close: "88.05", isin: "INE222B01012" },
    { symbol: "OTHER", close: "9.00" },
  ]);

  it("returns the trade date and only the asked-for symbols, in the order asked", () => {
    expect(parseBhavcopyCsv(csv, ["BETA", "ALPHA", "MISSING"])).toEqual({
      tradeDate: "2026-10-12",
      closes: [
        { symbol: "BETA", series: "EQ", isin: "INE222B01012", close: 88.05 },
        { symbol: "ALPHA", series: "EQ", isin: "INE111A01011", close: 1234.5 },
      ],
    });
  });

  it("still reports the date when no asked-for symbol is in the file", () => {
    expect(parseBhavcopyCsv(csv, ["MISSING"])).toEqual({ tradeDate: "2026-10-12", closes: [] });
    expect(parseBhavcopyCsv(csv, [])).toEqual({ tradeDate: "2026-10-12", closes: [] });
  });

  it("matches symbols case-blind and keeps symbols with punctuation", () => {
    const out = parseBhavcopyCsv(bhavCsv([{ symbol: "M&M", close: "2813.00" }, { symbol: "BAJAJ-AUTO", close: "10034.00" }]), ["m&m", "BAJAJ-AUTO"]);
    expect(out.closes.map((c) => c.symbol)).toEqual(["M&M", "BAJAJ-AUTO"]);
  });

  it("prefers EQ, then BE, BZ, SM, ST, whatever the order in the file", () => {
    const rows = [
      { symbol: "S1", series: "ST", close: "5" },
      { symbol: "S1", series: "SM", close: "4" },
      { symbol: "S1", series: "BZ", close: "3" },
      { symbol: "S1", series: "BE", close: "2" },
      { symbol: "S1", series: "EQ", close: "1" },
      { symbol: "S2", series: "SM", close: "4" },
      { symbol: "S2", series: "ST", close: "5" },
    ];
    const out = parseBhavcopyCsv(bhavCsv(rows), ["S1", "S2"]);
    expect(out.closes.map((c) => [c.symbol, c.series, c.close])).toEqual([["S1", "EQ", 1], ["S2", "SM", 4]]);
  });

  it("uses a symbol that trades in BE only, and ignores a symbol that is in no equity series", () => {
    const out = parseBhavcopyCsv(bhavCsv([{ symbol: "ONLYBE", series: "BE", close: "7.5" }, { symbol: "BOND", series: "GB", close: "14735.00" }]), ["ONLYBE", "BOND"]);
    expect(out.closes).toEqual([{ symbol: "ONLYBE", series: "BE", isin: "INE000A01010", close: 7.5 }]);
  });

  it("reads a quoted name that holds a comma and a doubled quote, with CRLF line ends and a byte-order mark", () => {
    const csv2 = `﻿${bhavCsv([{ symbol: "ALPHA", name: 'ALPHA, "THE" LTD', close: "10.00" }, { symbol: "BETA", close: "20.00" }], { eol: "\r\n" })}`;
    expect(parseBhavcopyCsv(csv2, ["BETA"]).closes).toHaveLength(1);
  });

  it("gives a blank ISIN as null, ignores columns it does not know, and ignores other segments", () => {
    const header = [...BHAVCOPY_HEADER, "BrandNewColumn"];
    const csv2 = bhavCsv([{ symbol: "ALPHA", isin: "", close: "10.00" }, { symbol: "ALPHA", sgmt: "FO", close: "999.00" }], { header });
    expect(parseBhavcopyCsv(csv2, ["ALPHA"]).closes).toEqual([{ symbol: "ALPHA", series: "EQ", isin: null, close: 10 }]);
  });
});

describe("parseBhavcopyCsv: refusals", () => {
  const good = [{ symbol: "ALPHA", close: "10.00" }];

  it("a wrong header row, a missing required column, a repeated one", () => {
    expect(refusal(() => parseBhavcopyCsv("a,b,c\n1,2,3\n", ["ALPHA"])).code).toBe("bad_header");
    expect(refusal(() => parseBhavcopyCsv(bhavCsv(good, { header: BHAVCOPY_HEADER.filter((n) => n !== "ClsPric") }), ["ALPHA"])).code).toBe("bad_header");
    expect(refusal(() => parseBhavcopyCsv(bhavCsv(good, { header: [...BHAVCOPY_HEADER, "ClsPric"] }), ["ALPHA"])).code).toBe("bad_header");
    expect(refusal(() => parseBhavcopyCsv(indexCsv([{ name: "Nifty 50" }]), ["ALPHA"])).code).toBe("bad_header");
  });

  it("an empty file, and a file with a header and no rows", () => {
    expect(refusal(() => parseBhavcopyCsv("", ["ALPHA"])).code).toBe("bad_header");
    expect(refusal(() => parseBhavcopyCsv(`${BHAVCOPY_HEADER.join(",")}\n`, ["ALPHA"])).code).toBe("empty");
  });

  it("a blank close, or a malformed number, on the row that would be used, never a silent zero", () => {
    for (const close of ["", "abc", "1,234.50", "-5", "0", "0.00", "1e5", "NaN", "Infinity", "12.3.4", "$5"]) {
      const err = refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", close }]), ["ALPHA"]));
      expect(err.code).toBe("bad_number");
    }
  });

  it("a bad number on a row nobody asked for is not read", () => {
    expect(parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", close: "10.00" }, { symbol: "OTHER", close: "oops" }]), ["ALPHA"]).closes).toHaveLength(1);
  });

  it("a bad number in a lower series does not matter when a better series is present", () => {
    const rows = [{ symbol: "S1", series: "EQ", close: "5.00" }, { symbol: "S1", series: "BE", close: "" }];
    expect(parseBhavcopyCsv(bhavCsv(rows), ["S1"]).closes[0]).toMatchObject({ series: "EQ", close: 5 });
  });

  it("the wrong series is never used when the better series has a blank close", () => {
    const rows = [{ symbol: "S1", series: "EQ", close: "" }, { symbol: "S1", series: "BE", close: "4.00" }];
    expect(refusal(() => parseBhavcopyCsv(bhavCsv(rows), ["S1"])).code).toBe("bad_number");
  });

  it("a bad date, and two dates in one file", () => {
    expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", date: "12-10-2026" }]), ["ALPHA"])).code).toBe("bad_date");
    expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", date: "2026-02-30" }]), ["ALPHA"])).code).toBe("bad_date");
    expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA" }, { symbol: "X", date: "2026-10-09" }]), ["ALPHA"])).code).toBe("bad_date");
  });

  it("the same symbol twice in one series", () => {
    expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA" }, { symbol: "ALPHA", close: "11.00" }]), ["ALPHA"])).code).toBe("duplicate");
  });

  it("a row with the wrong number of fields, and an unterminated quote", () => {
    expect(refusal(() => parseBhavcopyCsv(`${bhavCsv(good)}2026-10-12,2026-10-12,CM\n`, ["ALPHA"])).code).toBe("malformed");
    expect(refusal(() => parseBhavcopyCsv(`${BHAVCOPY_HEADER.join(",")}\n"2026-10-12,x`, ["ALPHA"])).code).toBe("malformed");
  });

  it("the message never carries a value from the file", () => {
    const err = refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", close: "SECRETVALUE" }]), ["ALPHA"]));
    expect(err.message).not.toContain("SECRETVALUE");
  });
});

describe("parseIndexCsv", () => {
  it("returns the Nifty 50 row's date and close, whatever the other rows say", () => {
    const csv = indexCsv([{ name: "Nifty Next 50", close: "68351.7" }, { name: "Nifty 50", date: "12-10-2026", close: "22363.35" }, { name: "Nifty Bank", close: "50000.1" }]);
    expect(parseIndexCsv(csv)).toEqual({ tradeDate: "2026-10-12", close: 22363.35 });
  });

  it("does not take Nifty 500 or Nifty 50 Value 20 for the Nifty 50", () => {
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 500" }, { name: "Nifty 50 Value 20" }]))).code).toBe("missing_index");
  });

  it("refuses a wrong header, a missing row, a repeated row, a bad date and a bad number", () => {
    expect(refusal(() => parseIndexCsv("a,b\n1,2\n")).code).toBe("bad_header");
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50" }], { header: INDEX_HEADER.filter((n) => n !== "Closing Index Value") }))).code).toBe("bad_header");
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty Bank" }]))).code).toBe("missing_index");
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50" }, { name: "Nifty 50" }]))).code).toBe("duplicate");
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50", date: "2026-10-12" }]))).code).toBe("bad_date");
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50", date: "31-02-2026" }]))).code).toBe("bad_date");
    for (const close of ["", "-", "0", "abc", "22,363.35", "-100"]) {
      expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50", close }]))).code).toBe("bad_number");
    }
  });
});

describe("the parser stops at its caps instead of reading on (review I-1)", () => {
  const junk = '"never reached';

  it("refuses more than 50,000 rows without reading past the cap", () => {
    // If the loop read on, it would hit the unterminated quote and report `malformed`.
    expect(refusal(() => parseCsvRows(`${"a\n".repeat(MAX_ROWS + 1)}${junk}`)).code).toBe("too_large");
    expect(refusal(() => parseCsvRows(`${",\n".repeat(MAX_ROWS + 1)}${junk}`)).code).toBe("too_large");
    expect(parseCsvRows("a\n".repeat(MAX_ROWS))).toHaveLength(MAX_ROWS);
  });

  it("refuses a row of more than 256 fields without reading past the cap", () => {
    expect(refusal(() => parseCsvRows(`${",".repeat(5000)}${junk}`)).code).toBe("too_large");
    expect(parseCsvRows(`${"x,".repeat(MAX_FIELDS_PER_ROW - 1)}x`)[0]).toHaveLength(MAX_FIELDS_PER_ROW);
    expect(refusal(() => parseCsvRows("x,".repeat(MAX_FIELDS_PER_ROW) + "x")).code).toBe("too_large");
  });

  it("refuses a field of more than 4,096 characters, quoted or not, without reading past the cap", () => {
    expect(refusal(() => parseCsvRows(`${"x".repeat(MAX_FIELD_CHARS + 2)}${junk}`)).code).toBe("too_large");
    expect(refusal(() => parseCsvRows(`"${"x".repeat(MAX_FIELD_CHARS + 2)}${junk}`)).code).toBe("too_large");
    expect(parseCsvRows("x".repeat(MAX_FIELD_CHARS))[0][0]).toHaveLength(MAX_FIELD_CHARS);
  });

  it("the parsers refuse the same shapes with the typed code", () => {
    expect(refusal(() => parseBhavcopyCsv("a\n".repeat(MAX_ROWS + 1), ["ALPHA"])).code).toBe("too_large");
    expect(refusal(() => parseIndexCsv(",\n".repeat(MAX_ROWS + 1))).code).toBe("too_large");
  });

  it("the real file's shape is far inside the caps", () => {
    const rows = Array.from({ length: 3714 }, (_, i) => ({ symbol: `S${i}` }));
    expect(parseBhavcopyCsv(bhavCsv(rows), ["S5"]).closes).toHaveLength(1);
  });
});

describe("quotes, ISINs and the price column (review M-1, M-2, M-3)", () => {
  it("refuses text after a closing quote: `\"10\"5` is not 105", () => {
    expect(refusal(() => parseCsvRows('a,"10"5\n')).code).toBe("malformed");
    expect(refusal(() => parseCsvRows('"a"b,c\n')).code).toBe("malformed");
    expect(parseCsvRows('a,"10"\n"x",y')).toEqual([["a", "10"], ["x", "y"]]);
    expect(parseCsvRows('"a ""b"" c",d\r\n')).toEqual([['a "b" c', "d"]]);
  });

  it("a close with a quote glued on is refused as a price", () => {
    const csv = `${BHAVCOPY_HEADER.join(",")}\n${bhavCsv([{ symbol: "ALPHA", close: "10.00" }]).split("\n")[1].replace("10.00", '"10"5')}\n`;
    expect(refusal(() => parseBhavcopyCsv(csv, ["ALPHA"])).code).toBe("malformed");
  });

  it("keeps an ISIN in its standard shape and gives null for blank or any other shape", () => {
    const run = (isin: string) => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", isin }]), ["ALPHA"]).closes[0].isin;
    expect(run("INE002A01018")).toBe("INE002A01018");
    expect(run(" INE002A01018 ")).toBe("INE002A01018");
    for (const odd of ["", "<script>alert(1)</script>", "X".repeat(50), "INE00", "ine002a01018", "INE002A0101A", "1NE002A01018"]) expect(run(odd)).toBeNull();
  });

  it("refuses the file when the ISIN of a used row holds a NUL or a control character", () => {
    for (const bad of ["INE002A0101\u0000", "INE\u0000", "INE002A01018\u0007", "\tINE002A01018"]) {
      expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", isin: bad }]), ["ALPHA"])).code).toBe("malformed");
    }
    // A row nobody asked for is not read.
    expect(parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA" }, { symbol: "OTHER", isin: "INE\u0000" }]), ["ALPHA"]).closes).toHaveLength(1);
  });

  it("refuses a price with more digits than the database column keeps (numeric(14, 4)), never dropping it silently", () => {
    expect(parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", close: "9999999999.9999" }]), ["ALPHA"]).closes[0].close).toBe(9999999999.9999);
    for (const close of ["12345678901", "123456789012.123456", "10.12345", "99999999999.00"]) {
      expect(refusal(() => parseBhavcopyCsv(bhavCsv([{ symbol: "ALPHA", close }]), ["ALPHA"])).code).toBe("bad_number");
    }
    expect(refusal(() => parseIndexCsv(indexCsv([{ name: "Nifty 50", close: "12345678901.5" }]))).code).toBe("bad_number");
  });
});
