import { describe, expect, it } from "vitest";
import { anchorFileName, compareYear, type AnchorRow } from "./ledger-anchor-compare";

const row = (date: string, published = false): AnchorRow => ({ date, line: `{"v":1,"date":"${date}"}`, published });
const text = (...rows: AnchorRow[]) => rows.map((r) => `${r.line}\n`).join("");
const FILE = "ledger-2026.jsonl";
const a = row("2026-10-01", true);
const b = row("2026-10-02", true);
const c = row("2026-10-03");
const d = row("2026-10-04");

describe("anchorFileName", () => {
  it("is one file per India calendar year", () => {
    expect(anchorFileName(2026)).toBe("ledger-2026.jsonl");
  });
});

describe("compareYear: the published file against ALL the database's lines, position by position", () => {
  it("a file that does not exist yet, with nothing published: every line is still to be written", () => {
    const r = compareYear(FILE, null, [c, d]);
    expect(r).toEqual({ kind: "ok", fileLines: 0, settled: [], tail: [c, d] });
  });

  it("an ordinary next day: the file holds the published lines, the new line is the tail", () => {
    const r = compareYear(FILE, text(a, b), [a, b, c]);
    expect(r).toEqual({ kind: "ok", fileLines: 2, settled: [], tail: [c] });
  });

  it("the database may hold MORE lines at the end than the file", () => {
    const b2 = row("2026-10-02");
    expect(compareYear(FILE, text(a), [a, b2, c, d])).toMatchObject({ kind: "ok", tail: [b2, c, d] });
  });

  it("nothing to add: the file already holds every line", () => {
    expect(compareYear(FILE, text(a, b), [a, b])).toEqual({ kind: "ok", fileLines: 2, settled: [], tail: [] });
  });

  it("lines already in the file but not marked (a crash after the write) are settled, not rewritten", () => {
    const r = compareYear(FILE, text(a, b, c), [a, b, row("2026-10-03")]);
    expect(r).toMatchObject({ kind: "ok", fileLines: 3, tail: [] });
    expect(r.kind === "ok" && r.settled.map((x) => x.date)).toEqual(["2026-10-03"]);
  });

  it("an empty file with nothing published is fine", () => {
    expect(compareYear(FILE, "", [c])).toMatchObject({ kind: "ok", fileLines: 0, tail: [c] });
  });

  it("refuses a line that differs, naming the first position and the ledger's date", () => {
    const edited = { ...b, line: b.line.replace("10-02", "10-09") };
    const r = compareYear(FILE, text(a, edited, c), [a, b, c]);
    expect(r).toEqual({ kind: "refuse", reason: "the public file ledger-2026.jsonl differs from the ledger at line 2 (2026-10-02)" });
  });

  it("refuses a differing line even where the database has not marked it published", () => {
    const edited = { ...c, line: "{}" };
    expect(compareYear(FILE, text(a, b, edited), [a, b, c])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("line 3 (2026-10-03)") });
  });

  it("refuses an extra published line the database does not have", () => {
    expect(compareYear(FILE, text(a, b, c), [a, b])).toEqual({
      kind: "refuse",
      reason: "the public file ledger-2026.jsonl has a line 3 that the ledger does not have",
    });
  });

  it("refuses a duplicated published date", () => {
    expect(compareYear(FILE, text(a, a, b), [a, b, c])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("line 2 (2026-10-02)") });
  });

  it("refuses published dates out of order", () => {
    expect(compareYear(FILE, text(b, a), [a, b])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("line 1 (2026-10-01)") });
  });

  it("refuses a file that is shorter than what the database marks as published", () => {
    expect(compareYear(FILE, text(a), [a, b, c])).toEqual({
      kind: "refuse",
      reason: "the public file ledger-2026.jsonl is missing line 2 (2026-10-02), which was published",
    });
  });

  it("refuses an empty file and a missing file when anything was published", () => {
    expect(compareYear(FILE, "", [a, b])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("missing line 1 (2026-10-01)") });
    expect(compareYear(FILE, null, [a, b])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("line 1 (2026-10-01)") });
  });

  it("refuses a file whose last line has no line break (it would be continued, not appended to)", () => {
    expect(compareYear(FILE, `${text(a)}${b.line}`, [a, b, c])).toEqual({
      kind: "refuse",
      reason: "the public file ledger-2026.jsonl does not end with a line break after line 2",
    });
  });

  it("a carriage return is a difference, not a line end", () => {
    expect(compareYear(FILE, `${a.line}\r\n`, [a])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("line 1 (2026-10-01)") });
  });

  it("a blank line in the file is an extra or a different line", () => {
    expect(compareYear(FILE, `${a.line}\n\n`, [a])).toMatchObject({ kind: "refuse" });
  });

  it("refuses a database line that is not a single line, whatever the file says", () => {
    const broken = { date: "2026-10-05", line: "x\ny", published: false };
    expect(compareYear(FILE, null, [broken])).toMatchObject({ kind: "refuse", reason: expect.stringContaining("2026-10-05") });
  });

  it("never copies any text of the file into the reason", () => {
    const hostile = "SECRET-TOKEN-ghp_123 <script>";
    const r = compareYear(FILE, `${hostile}\n`, [a]);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("script");
  });
});
