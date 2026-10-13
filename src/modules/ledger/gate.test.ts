import { describe, expect, it } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createFakeDb } from "./fake-db";
import { clearDateFrom, holdsOpenPosition, stanceClearDate } from "./gate";

describe("clearDateFrom: rule 4 on the India calendar", () => {
  it("no stance-changing entry: clear", () => {
    expect(clearDateFrom(null, "2026-10-13")).toBeNull();
  });

  it("an entry on 14 Sep (India) is clear from 14 Oct, and not before", () => {
    expect(clearDateFrom("2026-09-14T05:00:00.000Z", "2026-10-13")).toBe("2026-10-14");
    expect(clearDateFrom("2026-09-14T05:00:00.000Z", "2026-10-14")).toBeNull();
    expect(clearDateFrom("2026-09-14T05:00:00.000Z", "2026-10-15")).toBeNull();
  });

  it("takes the India date, not the UTC date: 19:00Z on 13 Sep is 00:30 on 14 Sep in India", () => {
    expect(clearDateFrom("2026-09-13T19:00:00.000Z", "2026-10-13")).toBe("2026-10-14");
    expect(clearDateFrom("2026-09-13T18:29:59.000Z", "2026-10-13")).toBeNull(); // 23:59:59 IST on 13 Sep -> 13 Oct
  });
});

describe("stanceClearDate: reads the ledger as the admin", () => {
  it("returns the date from which rule 4 passes", async () => {
    const { db, calls } = createFakeDb([
      { data: [{ id: "i1" }, { id: "i2" }] },
      { data: [{ recorded_at: "2026-09-20T05:00:00.000Z" }] },
    ]);
    expect(await stanceClearDate(db, "co1", "2026-10-13")).toBe("2026-10-20");
    expect(calls[0]).toEqual({
      target: "ideas",
      ops: [["select", "id"], ["eq", "company_id", "co1"], ["neq", "status", "void"]],
    });
    expect(calls[1]).toEqual({
      target: "idea_events",
      ops: [
        ["select", "recorded_at"], ["in", "idea_id", ["i1", "i2"]], ["in", "kind", ["open", "close", "upsize", "downsize"]],
        ["order", "recorded_at", { ascending: false }], ["limit", 1],
      ],
    });
  });

  it("a note, revise or review does not count: only the four stance-changing kinds are asked for", async () => {
    const { db, calls } = createFakeDb([{ data: [{ id: "i1" }] }, { data: [] }]);
    expect(await stanceClearDate(db, "co1", "2026-10-13")).toBeNull();
    expect(JSON.stringify(calls[1]!.ops)).not.toMatch(/note|revise|review/);
  });

  it("no non-void idea on the company: clear, and no event query is made", async () => {
    const { db, calls } = createFakeDb([{ data: [] }]);
    expect(await stanceClearDate(db, "co1", "2026-10-13")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("an entry older than 30 days is clear", async () => {
    const { db } = createFakeDb([{ data: [{ id: "i1" }] }, { data: [{ recorded_at: "2026-08-01T05:00:00.000Z" }] }]);
    expect(await stanceClearDate(db, "co1", "2026-10-13")).toBeNull();
  });

  it("a database failure is thrown, never read as 'clear'", async () => {
    const { db } = createFakeDb([{ error: { message: "boom", code: "08006" } }]);
    await expect(stanceClearDate(db, "co1", "2026-10-13")).rejects.toBeInstanceOf(DbError);
    const second = createFakeDb([{ data: [{ id: "i1" }] }, { error: { message: "boom" } }]);
    await expect(stanceClearDate(second.db, "co1", "2026-10-13")).rejects.toBeInstanceOf(DbError);
  });
});

describe("holdsOpenPosition", () => {
  it("is true when an open idea on the company is held", async () => {
    const { db, calls } = createFakeDb([{ data: [{ id: "i1" }] }]);
    expect(await holdsOpenPosition(db, "co1")).toBe(true);
    expect(calls[0]).toEqual({
      target: "ideas",
      ops: [["select", "id"], ["eq", "company_id", "co1"], ["eq", "status", "open"], ["eq", "held", true], ["limit", 1]],
    });
  });

  it("is false when there is none, and a failure is thrown rather than read as false", async () => {
    expect(await holdsOpenPosition(createFakeDb([{ data: [] }]).db, "co1")).toBe(false);
    await expect(holdsOpenPosition(createFakeDb([{ error: { message: "boom" } }]).db, "co1")).rejects.toBeInstanceOf(DbError);
  });
});
