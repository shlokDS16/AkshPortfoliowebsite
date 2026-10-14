import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createFakeDb } from "./fake-db";
import { ledgerGateFacts } from "./gate";

describe("ledgerGateFacts: asks the database for what the gate will conclude", () => {
  it("calls the one function the gate itself uses, never a table the owner can edit", async () => {
    const { db, calls } = createFakeDb([{ data: [{ ledger_ok: true, clear_from: "2026-11-12", holds_position: false }] }]);
    expect(await ledgerGateFacts(db, "co1")).toEqual({ ledgerOk: true, stanceClearDate: "2026-11-12", holdsOpenPosition: false });
    expect(calls).toEqual([{ target: "rpc:ledger_gate_facts", ops: [["args", { p_company_id: "co1" }]] }]);
  });

  it("a null clear date means rule 4 is clear now", async () => {
    const { db } = createFakeDb([{ data: [{ ledger_ok: true, clear_from: null, holds_position: true }] }]);
    expect(await ledgerGateFacts(db, "co1")).toEqual({ ledgerOk: true, stanceClearDate: null, holdsOpenPosition: true });
  });

  it("a ledger that failed its own check is reported, not hidden", async () => {
    const { db } = createFakeDb([{ data: [{ ledger_ok: false, clear_from: null, holds_position: null }] }]);
    expect(await ledgerGateFacts(db, "co1")).toEqual({ ledgerOk: false, stanceClearDate: null, holdsOpenPosition: false });
  });

  it("a database failure, or no row at all, is thrown and never read as 'clear'", async () => {
    await expect(ledgerGateFacts(createFakeDb([{ error: { message: "boom", code: "08006" } }]).db, "co1")).rejects.toBeInstanceOf(DbError);
    await expect(ledgerGateFacts(createFakeDb([{ data: [] }]).db, "co1")).rejects.toBeInstanceOf(DbError);
    await expect(ledgerGateFacts(createFakeDb([{ data: null }]).db, "co1")).rejects.toBeInstanceOf(DbError);
  });
});
