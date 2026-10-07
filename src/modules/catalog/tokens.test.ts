import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { DbError } from "@/lib/supabase/errors";
import { listKnownTokens } from "./tokens";

type Result = { data: unknown; error: { message: string } | null };

/** A chainable stand-in for the query builder: records each filter per table, then resolves the table's result. */
function fakeDb(results: Record<string, Result>) {
  const filters: Record<string, string[]> = {};
  const from = (table: string) => {
    const log = (filters[table] = []) as string[];
    const chain: Record<string, unknown> = {
      then: (resolve: (r: Result) => unknown) => resolve(results[table]),
    };
    for (const name of ["select", "eq", "is", "not"]) {
      chain[name] = (...args: unknown[]) => {
        log.push(`${name}(${args.join(",")})`);
        return chain;
      };
    }
    return chain;
  };
  return { db: { from } as unknown as Db, filters };
}

const ok = (data: unknown): Result => ({ data, error: null });

describe("listKnownTokens", () => {
  const results = {
    companies: ok([{ nse_symbol: "KAVPUMP" }, { nse_symbol: null }]),
    company_aliases: ok([{ symbol: "KAVERI" }]),
    themes: ok([{ slug: "capital-cycle" }]),
    ignored_tokens: ok([
      { kind: "symbol", token: "AND" },
      { kind: "theme", token: "misc" },
      { kind: "symbol", token: "THE" },
    ]),
  };

  it("reads only screened, non-archived companies and themes with a symbol", async () => {
    const { db, filters } = fakeDb(results);
    await listKnownTokens(db);
    expect(filters.companies).toEqual(["select(nse_symbol)", "eq(needs_review,false)", "is(archived_at,)", "not(nse_symbol,is,)"]);
    expect(filters.themes).toEqual(["select(slug)", "eq(needs_review,false)", "is(archived_at,)"]);
  });

  it("merges company symbols with aliases, drops null symbols, and splits ignored tokens by kind", async () => {
    const { db } = fakeDb(results);
    expect(await listKnownTokens(db)).toEqual({
      symbols: ["KAVPUMP", "KAVERI"],
      themes: ["capital-cycle"],
      ignoredSymbols: ["AND", "THE"],
      ignoredThemes: ["misc"],
    });
  });

  it("returns empty lists for empty tables", async () => {
    const { db } = fakeDb({ companies: ok(null), company_aliases: ok([]), themes: ok([]), ignored_tokens: ok(null) });
    expect(await listKnownTokens(db)).toEqual({ symbols: [], themes: [], ignoredSymbols: [], ignoredThemes: [] });
  });

  it("throws a DbError carrying the operation, not the row data, when any read fails", async () => {
    const { db } = fakeDb({ ...results, ignored_tokens: { data: null, error: { message: "boom" } } });
    const error = await listKnownTokens(db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DbError);
    expect((error as DbError).op).toBe("catalog.knownTokens");
  });
});
