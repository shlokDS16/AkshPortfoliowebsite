import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseCasesRepo } from "./repo";

// F8: the desk resolves a merged company exactly as the gate's case_company check does, one alias step (migration 0018), so a
// draft is never filed under a company the gate would refuse.

const A = "8a1f0f64-0000-4a00-8000-0000000000a1";
const B = "8a1f0f64-0000-4a00-8000-0000000000b2";
const C = "8a1f0f64-0000-4a00-8000-0000000000c3";

/** Just enough of the query builder: select(...).eq(column, value).maybeSingle() over two small tables. */
function stubDb(symbols: Record<string, string>, aliases: Record<string, string>): { db: Db; reads: string[] } {
  const reads: string[] = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async () => {
              reads.push(`${table}:${value}`);
              if (table === "companies") return { data: symbols[value] ? { nse_symbol: symbols[value] } : null, error: null };
              return { data: aliases[value] ? { company_id: aliases[value] } : null, error: null };
            },
          }),
        }),
      };
    },
  } as unknown as Db;
  return { db, reads };
}

describe("resolveCompany", () => {
  it("follows exactly one alias step, as the gate does: A merged into B, B later aliased to C, files under B", async () => {
    const { db } = stubDb({ [A]: "SA", [B]: "SB" }, { SA: B, SB: C });
    expect(await createSupabaseCasesRepo(db).resolveCompany(A)).toBe(B);
  });

  it("returns the company itself when it was never merged", async () => {
    const { db } = stubDb({ [A]: "SA" }, {});
    expect(await createSupabaseCasesRepo(db).resolveCompany(A)).toBe(A);
  });
});
