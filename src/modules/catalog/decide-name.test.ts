import { describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { DbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { NameOnPublicItemError } from "./errors";
import { decideName, listNamesToScreen, NAMES_PAGE_SIZE } from "./names";

type Call = { table: string; verb: "select" | "update" | "upsert"; payload: unknown; filters: [string, unknown][] };
type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };

/** A chainable stand-in for the supabase-js builder: records each call, answers from `respond`. */
function fakeDb(respond: (call: Call) => Result) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, verb: "select", payload: null, filters: [] };
    const builder: Record<string, unknown> = {};
    const chain = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
      fn(...args);
      return builder;
    };
    for (const verb of ["select", "update", "upsert"] as const) {
      builder[verb] = chain((payload) => {
        if (call.verb === "select" || verb !== "select") call.verb = verb;
        if (verb !== "select") call.payload = payload;
      });
    }
    for (const filter of ["eq", "neq", "is", "in", "match", "order", "limit"]) {
      builder[filter] = chain((...args) => void call.filters.push([filter, args]));
    }
    builder.maybeSingle = () => builder;
    builder.then = (resolve: (r: Result) => unknown) => {
      calls.push(call);
      const result = respond(call);
      return Promise.resolve({ data: null, error: null, ...result }).then(resolve);
    };
    return builder;
  };
  return { db: { from } as unknown as Db, calls };
}

const writes = (calls: Call[]) => calls.filter((c) => c.verb !== "select");
const filterOf = (call: Call, name: string, column: string) => call.filters.some(([n, a]) => n === name && Array.isArray(a) && a[0] === column);

/** Answers the reads decideName makes for a live, unscreened company stub; `over` customises the rest. */
function stubReads(over: (call: Call) => Result | undefined = () => undefined) {
  return (call: Call): Result => {
    const custom = over(call);
    if (custom) return custom;
    if (call.verb !== "select") return {};
    if (call.table === "companies" && call.filters.some(([n, a]) => n === "neq" && Array.isArray(a) && a[0] === "id")) return { data: { id: "c1" } };
    if (call.table === "companies") return { data: { key: "KAVPUMPS", needs_review: true, archived_at: null } };
    if (call.table === "items") return { count: 0 };
    return {};
  };
}

const STUB = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

describe("decideName", () => {
  it("refuses 'Same as' and writes nothing when a public item names the stub", async () => {
    const { db, calls } = fakeDb(stubReads((c) => (c.table === "items" ? { count: 1 } : undefined)));
    await expect(decideName(db, "company", STUB, { kind: "merge", intoId: TARGET })).rejects.toBeInstanceOf(NameOnPublicItemError);
    expect(writes(calls)).toEqual([]);
  });

  it("refuses 'Not a company' the same way", async () => {
    const { db, calls } = fakeDb(stubReads((c) => (c.table === "items" ? { count: 2 } : undefined)));
    await expect(decideName(db, "company", STUB, { kind: "plain" })).rejects.toBeInstanceOf(NameOnPublicItemError);
    expect(writes(calls)).toEqual([]);
  });

  it("maps the catalog guard's 23514 to NameOnPublicItemError", async () => {
    const { db } = fakeDb(
      stubReads((c) => (c.verb === "update" && c.table === "companies" ? { error: { message: "companies.x: public items use it; unpublish them first", code: "23514" } } : undefined)),
    );
    await expect(decideName(db, "company", STUB, { kind: "new", name: "Kaveri", sector: "Other" })).rejects.toBeInstanceOf(NameOnPublicItemError);
  });

  it("keeps any other database error a DbError", async () => {
    const { db } = fakeDb(stubReads((c) => (c.verb === "update" ? { error: { message: "boom", code: "57P01" } } : undefined)));
    await expect(decideName(db, "company", STUB, { kind: "new", name: "Kaveri", sector: "Other" })).rejects.toBeInstanceOf(DbError);
  });

  it("refuses an alias that already points at a different company, and records nothing", async () => {
    const { db, calls } = fakeDb(stubReads((c) => (c.table === "company_aliases" ? { data: { company_id: "99999999-9999-4999-8999-999999999999" } } : undefined)));
    await expect(decideName(db, "company", STUB, { kind: "merge", intoId: TARGET })).rejects.toBeInstanceOf(InvalidInputError);
    expect(writes(calls)).toEqual([]);
  });

  it("accepts a repeat of the same alias (idempotent) and writes the alias, items, captures and archive", async () => {
    const { db, calls } = fakeDb(stubReads((c) => (c.table === "company_aliases" && c.verb === "select" ? { data: { company_id: TARGET } } : undefined)));
    await decideName(db, "company", STUB, { kind: "merge", intoId: TARGET });
    expect(writes(calls).map((c) => `${c.verb}:${c.table}`)).toEqual(["upsert:company_aliases", "update:items", "update:captures", "update:companies"]);
  });

  it("private-only item updates are fenced to non-public rows", async () => {
    const { db, calls } = fakeDb(stubReads());
    await decideName(db, "company", STUB, { kind: "plain" });
    const items = calls.find((c) => c.verb === "update" && c.table === "items");
    expect(items && filterOf(items, "neq", "visibility")).toBe(true);
  });
});

describe("listNamesToScreen", () => {
  it("caps each stub query, orders it oldest first, and reads one ordered first capture per stub", async () => {
    const companies = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, nse_symbol: `SYM${i}`, name: `SYM${i}`, created_at: `2026-10-0${i + 1}T00:00:00Z` }));
    const { db, calls } = fakeDb((c) => {
      if (c.table === "companies" && filterOf(c, "eq", "needs_review") && c.filters.some(([, a]) => Array.isArray(a) && a[0] === "needs_review" && a[1] === true)) return { data: companies };
      if (c.table === "captures") return { data: { raw_text: `first ${String((c.filters.find(([n]) => n === "eq")?.[1] as unknown[])[1])}` } };
      return { data: [] };
    });
    const names = await listNamesToScreen(db);
    expect(names.map((n) => n.id)).toEqual(["c0", "c1", "c2"]);
    const stubQuery = calls.find((c) => c.table === "companies" && c.filters.some(([, a]) => Array.isArray(a) && a[1] === true));
    expect(stubQuery?.filters).toContainEqual(["limit", [NAMES_PAGE_SIZE]]);
    expect(stubQuery?.filters).toContainEqual(["order", ["created_at", { ascending: true }]]);
    const captureReads = calls.filter((c) => c.table === "captures");
    expect(captureReads).toHaveLength(3);
    for (const read of captureReads) {
      expect(read.filters).toContainEqual(["order", ["created_at", { ascending: true }]]);
      expect(read.filters).toContainEqual(["limit", [1]]);
      expect(filterOf(read, "in", "company_id")).toBe(false);
    }
    expect(names[0].quote).toBe("first c0");
  });

  it("never reads more than one page of first captures", async () => {
    const companies = Array.from({ length: NAMES_PAGE_SIZE }, (_, i) => ({ id: `c${String(i).padStart(3, "0")}`, nse_symbol: `S${i}A`, name: `S${i}A`, created_at: "2026-10-01T00:00:00Z" }));
    const themes = Array.from({ length: NAMES_PAGE_SIZE }, (_, i) => ({ id: `t${String(i).padStart(3, "0")}`, slug: `t-${i}`, name: `T ${i}`, created_at: "2026-10-02T00:00:00Z" }));
    const { db, calls } = fakeDb((c) => {
      if (c.table === "companies" && c.filters.some(([, a]) => Array.isArray(a) && a[1] === true)) return { data: companies };
      if (c.table === "themes") return { data: themes };
      return { data: null };
    });
    const names = await listNamesToScreen(db);
    expect(names).toHaveLength(NAMES_PAGE_SIZE);
    expect(names.every((n) => n.type === "company")).toBe(true);
    expect(calls.filter((c) => c.table === "captures")).toHaveLength(NAMES_PAGE_SIZE);
  });
});
