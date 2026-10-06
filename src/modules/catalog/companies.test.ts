import { describe, expect, it } from "vitest";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import type { Db } from "@/lib/supabase/types";
import { getCompanyBrief, setCompanyPublic } from "./companies";
import { NameNotScreenedError } from "./errors";

/** A query-builder stub that records the filters and resolves with `result`. */
function stubDb(result: { data: unknown; error: null }) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "update", "eq", "is"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push(`${name}:${args.map(String).join(",")}`);
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { db: { from: () => chain } as unknown as Db, calls };
}

describe("setCompanyPublic", () => {
  it("updates only a screened, unarchived row", async () => {
    const { db, calls } = stubDb({ data: [{ id: "c1" }], error: null });
    await setCompanyPublic(db, "c1");
    expect(calls).toEqual(expect.arrayContaining(["update:[object Object]", "eq:id,c1", "eq:needs_review,false", "is:archived_at,null"]));
  });

  it("refuses an unscreened or archived stub in words", async () => {
    const { db } = stubDb({ data: [], error: null });
    await expect(setCompanyPublic(db, "c1")).rejects.toBeInstanceOf(NameNotScreenedError);
  });

  it("reaches the screen as a fixed code", () => {
    const error = new NameNotScreenedError();
    expect(errorCode(error)).toBe("name-not-screened");
    expect(errorText("name-not-screened")).toBe(error.message);
    expect(userWasTold(error)).toBe(true);
  });
});

describe("getCompanyBrief", () => {
  it("maps the row, and returns null for no row", async () => {
    const row = { id: "c1", name: "Kaveri Pumps (fictional)", nse_symbol: null, visibility: "private", needs_review: false };
    expect(await getCompanyBrief(stubDb({ data: row, error: null }).db, "c1")).toEqual({ id: "c1", name: row.name, nseSymbol: null, visibility: "private", needsReview: false });
    expect(await getCompanyBrief(stubDb({ data: null, error: null }).db, "c1")).toBeNull();
  });
});
