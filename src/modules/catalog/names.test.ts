import { describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { planDecision, suggestMatch, type NameStub } from "./names";

const NOW = "2026-10-07T05:00:00.000Z";
const company: NameStub = { type: "company", id: "s1", key: "KAVPUMPS" };
const theme: NameStub = { type: "theme", id: "t1", key: "capex" };

describe("New names", () => {
  it("suggests an already-screened company that the token looks like", () => {
    const candidates = [
      { id: "c1", symbol: "KAVPUMP", name: "Kaveri Pumps (fictional)" },
      { id: "c2", symbol: "SAHCOLD", name: "Sahyadri Cold Chain (fictional)" },
    ];
    expect(suggestMatch("$KAVPUMPS", candidates)).toEqual({ id: "c1", label: "Kaveri Pumps (fictional)" });
    expect(suggestMatch("$kaveri", candidates)).toEqual({ id: "c1", label: "Kaveri Pumps (fictional)" });
    expect(suggestMatch("$ZZZ", candidates)).toBeNull();
  });

  it("'Yes, add it' names the company and its sector in one update; nothing is archived", () => {
    expect(planDecision(company, { kind: "new", name: "Kaveri Pumps (fictional)", sector: "Capital goods" }, NOW)).toEqual([
      { op: "update", table: "companies", set: { name: "Kaveri Pumps (fictional)", sector: "Capital goods", needs_review: false }, match: { id: "s1" } },
    ]);
  });

  it("'Yes, add it' on a theme has no sector", () => {
    expect(planDecision(theme, { kind: "new", name: "Capex", sector: null }, NOW)).toEqual([
      { op: "update", table: "themes", set: { name: "Capex", needs_review: false }, match: { id: "t1" } },
    ]);
  });

  it("'Same as' records an alias, re-points private items and captures, then archives the stub (A1.4: no frozen column is written)", () => {
    expect(planDecision(company, { kind: "merge", intoId: "c1" }, NOW)).toEqual([
      { op: "insert", table: "company_aliases", row: { symbol: "KAVPUMPS", company_id: "c1" } },
      { op: "update", table: "items", set: { company_id: "c1" }, match: { company_id: "s1" }, privateOnly: true },
      { op: "update", table: "captures", set: { company_id: "c1" }, match: { company_id: "s1" } },
      { op: "update", table: "companies", set: { needs_review: false, archived_at: NOW }, match: { id: "s1" } },
    ]);
  });

  it("'Not a theme' records an ignored token, unlinks private items and captures, then archives", () => {
    expect(planDecision(theme, { kind: "plain" }, NOW)).toEqual([
      { op: "insert", table: "ignored_tokens", row: { kind: "theme", token: "capex" } },
      { op: "update", table: "items", set: { theme_id: null }, match: { theme_id: "t1" }, privateOnly: true },
      { op: "update", table: "captures", set: { theme_id: null }, match: { theme_id: "t1" } },
      { op: "update", table: "themes", set: { needs_review: false, archived_at: NOW }, match: { id: "t1" } },
    ]);
  });

  it("'Not a company' records the symbol as ignored", () => {
    expect(planDecision(company, { kind: "plain" }, NOW)[0]).toEqual({ op: "insert", table: "ignored_tokens", row: { kind: "symbol", token: "KAVPUMPS" } });
  });

  it("a theme cannot be merged into a company", () => {
    expect(() => planDecision(theme, { kind: "merge", intoId: "c1" }, NOW)).toThrow(InvalidInputError);
  });

  it("a stub with no key has no alias or ignored write", () => {
    const ops = planDecision({ ...company, key: null }, { kind: "plain" }, NOW);
    expect(ops.some((o) => o.op === "insert")).toBe(false);
    expect(ops).toHaveLength(3);
  });

  it("never writes a column the catalog guard freezes, except the first 'new' naming of an unlinked stub", () => {
    const frozen = ["slug", "nse_symbol", "one_liner", "bse_code", "isin"];
    for (const d of [{ kind: "merge", intoId: "c1" } as const, { kind: "plain" } as const]) {
      for (const op of planDecision(company, d, NOW)) {
        if (op.op === "update") for (const column of [...frozen, "name", "sector"]) expect(op.set).not.toHaveProperty(column);
      }
    }
  });
});
