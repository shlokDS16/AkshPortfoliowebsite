import { describe, expect, it } from "vitest";
import type { AnchorReadAll } from "@/lib/providers";
import { publishAnchors } from "./ledger-anchor";
import { anchorDeps, fakeAnchor, fakeAnchorDb, fileOf, lineFor, rowsFor, type FakeAnchorRow } from "./ledger-anchor-test-kit";

// Task 9 fix round 1 (review task-9-review.md): I-1, I-2, M-1, M-2, M-4, M-5, M-6, M-8.

const FILE = "ledger-2026.jsonl";
const NOW = new Date("2026-10-13T02:00:00Z");
const published = (...dates: string[]): FakeAnchorRow[] => rowsFor(...dates).map((r) => ({ ...r, published: true }));
const D = ["2026-10-01", "2026-10-02", "2026-10-03"];

type Settled = { ok: true; detail: string } | { ok: false; detail: string };
const settle = (p: Promise<string>): Promise<Settled> => p.then((detail) => ({ ok: true as const, detail }), (e: Error) => ({ ok: false as const, detail: e.message }));
const NOT_CONFIGURED: AnchorReadAll = { kind: "not_configured" };

describe("I-1: when the public copy is on, the file is ALWAYS read and compared", () => {
  it("a database with no sealed line beside a gist that holds lines is a refusal, not a green run (a restore, a new project)", async () => {
    const d = fakeAnchorDb({});
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D) } });
    expect(await settle(publishAnchors(anchorDeps(d.db, port, NOW)))).toEqual({ ok: false, detail: `the public file ${FILE} has a line 1 that the ledger does not have; nothing was published` });
    expect(port.writes()).toEqual([]);
    expect(d.updates).toEqual([]);
  });

  it("a database that only starts in a later year does not hide the earlier year's published file", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2027-01-05") });
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D) } });
    const r = await settle(publishAnchors(anchorDeps(d.db, port, new Date("2027-01-06T02:00:00Z"))));
    expect(r).toEqual({ ok: false, detail: `the public file ${FILE} has a line 1 that the ledger does not have; nothing was published` });
    expect(port.writes()).toEqual([]);
  });

  it("an empty database in a later calendar year still reads the first year (years run from the fixed first year to the current India year)", async () => {
    const d = fakeAnchorDb({});
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D) } });
    expect((await settle(publishAnchors(anchorDeps(d.db, port, new Date("2028-03-01T02:00:00Z"))))).ok).toBe(false);
  });

  it("the current India year counts even when the database holds nothing from it (31 December UTC is already January in India)", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-12-30") });
    const port = fakeAnchor({ files: { "ledger-2027.jsonl": fileOf("2027-01-01") } });
    const r = await settle(publishAnchors(anchorDeps(d.db, port, new Date("2026-12-31T20:00:00Z"))));
    expect(r.detail).toContain("ledger-2027.jsonl has a line 1 that the ledger does not have");
  });

  it("a ledger file for a year the database has nothing for, in the past or the future, is refused", async () => {
    for (const name of ["ledger-2025.jsonl", "ledger-2030.jsonl"]) {
      const d = fakeAnchorDb({ rows: published(...D) });
      const port = fakeAnchor({ files: { [FILE]: fileOf(...D), [name]: fileOf("2030-01-01") } });
      const r = await settle(publishAnchors(anchorDeps(d.db, port, NOW)));
      expect(r.detail, name).toContain(`the public file ${name} has a line 1 that the ledger does not have`);
    }
  });

  it("other files in the gist (a readme) are ignored", async () => {
    const d = fakeAnchorDb({ rows: published(...D) });
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D), "README.md": "hello", "ledger-notes.txt": "x" } });
    expect((await settle(publishAnchors(anchorDeps(d.db, port, NOW)))).detail).toBe("sealed 0 days; the public copy is up to date");
  });

  it("nothing sealed and nothing published is green after exactly one request (an empty gist, or an empty file)", async () => {
    for (const files of [{} as Record<string, string>, { [FILE]: "" }]) {
      const d = fakeAnchorDb({});
      const port = fakeAnchor({ files });
      expect(await publishAnchors(anchorDeps(d.db, port, NOW))).toBe("sealed 0 days; no finished day to publish yet");
      expect(port.calls.map((c) => c.kind)).toEqual(["readAll"]);
    }
  });

  it("a whole run is ONE read of the gist, however many years the ledger spans (M-4); a write adds one check read", async () => {
    const d = fakeAnchorDb({ rows: published("2026-12-31", "2027-01-01") });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-12-31"), "ledger-2027.jsonl": fileOf("2027-01-01") } });
    await publishAnchors(anchorDeps(d.db, port, new Date("2027-03-01T00:00:00Z")));
    expect(port.calls.map((c) => c.kind)).toEqual(["readAll"]);
    const e = fakeAnchorDb({ rows: [...published("2026-12-31"), ...rowsFor("2027-01-01")] });
    const other = fakeAnchor({ files: { [FILE]: fileOf("2026-12-31") } });
    await publishAnchors(anchorDeps(e.db, other, new Date("2027-03-01T00:00:00Z")));
    expect(other.calls.map((c) => c.kind)).toEqual(["readAll", "write", "readAll"]);
  });
});

describe("I-2: a public copy that was on and is now off is red", () => {
  it("not configured, and some line was published before: the step fails with a plain private reason, and publishes nothing", async () => {
    const d = fakeAnchorDb({ rows: [...published(D[0]!), ...rowsFor(D[1]!, D[2]!)] });
    const port = fakeAnchor({ name: "off", readAll: () => NOT_CONFIGURED });
    expect(await settle(publishAnchors(anchorDeps(d.db, port, NOW)))).toEqual({
      ok: false,
      detail: "the public copy is switched off, but lines were published before; the public file was not checked (2 days waiting)",
    });
    expect(port.writes()).toEqual([]);
    expect(d.updates).toEqual([]);
  });

  it("not configured and nothing was ever published (the default): green, with the waiting count, even with no rows at all", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(...D) });
    expect(await publishAnchors(anchorDeps(d.db, fakeAnchor({ readAll: () => NOT_CONFIGURED }), NOW))).toBe("sealed 0 days; the public copy is off, 3 days waiting");
    const none = fakeAnchorDb({});
    expect(await publishAnchors(anchorDeps(none.db, fakeAnchor({ readAll: () => NOT_CONFIGURED }), NOW))).toBe("sealed 0 days; the public copy is off, 0 days waiting");
  });

  it("a single published line is enough, and the reason says no more than counts", async () => {
    const d = fakeAnchorDb({ rows: published(D[0]!) });
    const r = await settle(publishAnchors(anchorDeps(d.db, fakeAnchor({ readAll: () => NOT_CONFIGURED }), NOW)));
    expect(r).toEqual({ ok: false, detail: "the public copy is switched off, but lines were published before; the public file was not checked (0 days waiting)" });
  });
});

describe("M-2 and M-1: two overlapping runs", () => {
  it("a twin run whose check sees exactly the text it was about to send reports a harmless success and records nothing", async () => {
    const a = fakeAnchorDb({ rows: rowsFor(...D) });
    const b = fakeAnchorDb({ rows: rowsFor(...D) });
    const port = fakeAnchor({});
    const stale = { ...port, readAll: async (): Promise<AnchorReadAll> => ({ kind: "ok", files: new Map(), version: null }) }; // B read before A wrote
    expect(await publishAnchors(anchorDeps(a.db, port, NOW))).toMatch(/added 3 days/);
    expect(await publishAnchors(anchorDeps(b.db, stale, NOW))).toBe("sealed 0 days; the public copy was already updated by another run; it will be recorded on the next run");
    expect(b.updates).toEqual([]);
    expect(await publishAnchors(anchorDeps(b.db, port, NOW))).toBe("sealed 0 days; recorded 3 days already in the public copy");
    expect(port.files.get(FILE)).toBe(fileOf(...D));
  });

  it("a `changed` answer with anything else in the file stays a failure (and never quotes the file)", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(...D) });
    const port = fakeAnchor({ files: { [FILE]: "ghp_SECRET\n" } });
    const stale = { ...port, readAll: async (): Promise<AnchorReadAll> => ({ kind: "ok", files: new Map(), version: null }) };
    const r = await settle(publishAnchors(anchorDeps(d.db, stale, NOW)));
    expect(r).toEqual({ ok: false, detail: "the public file changed while it was being updated; nothing was written or recorded, and the next run will check it again" });
  });

  it("a line overwritten by another run right after our write is not marked published", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(...D) });
    let reads = 0;
    const port = fakeAnchor({});
    const racing = { ...port, readAll: async (o?: { timeoutMs?: number }): Promise<AnchorReadAll> => {
      reads += 1;
      if (reads === 2) port.files.set(FILE, fileOf(D[0]!, D[1]!)); // the other run's shorter text landed after ours
      return port.readAll(o);
    } };
    const r = await settle(publishAnchors(anchorDeps(d.db, racing, NOW)));
    expect(r).toEqual({ ok: false, detail: "the public file no longer matches what this run wrote and compared; nothing was recorded, and the next run will check it again" });
    expect(d.updates).toEqual([]);
    expect(d.published()).toEqual([]);
  });

  it("a longer file that still begins with our text (another run added more after us) is fine: our lines are marked", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(...D) });
    const port = fakeAnchor({});
    let reads = 0;
    const racing = { ...port, readAll: async (o?: { timeoutMs?: number }): Promise<AnchorReadAll> => {
      reads += 1;
      if (reads === 2) port.files.set(FILE, `${fileOf(...D)}${lineFor("2026-10-04")}\n`);
      return port.readAll(o);
    } };
    expect(await publishAnchors(anchorDeps(d.db, racing, NOW))).toMatch(/added 3 days/);
    expect(d.published()).toEqual(D);
  });

  it("the check read after the write failing, or no time left for it, records nothing and says so", async () => {
    for (const failing of [true, false]) {
      const d = fakeAnchorDb({ rows: rowsFor(D[0]!) });
      let t = 0;
      let reads = 0;
      const port = fakeAnchor({ onCall: (kind) => { if (kind === "write" && !failing) t += 14_500; } });
      const wrapped = { ...port, readAll: async (o?: { timeoutMs?: number }): Promise<AnchorReadAll> => {
        reads += 1;
        return failing && reads === 2 ? { kind: "provider_error", message: "ghp_SECRET" } : port.readAll(o);
      } };
      const r = await settle(publishAnchors(anchorDeps(d.db, wrapped, NOW, () => t)));
      expect(r, String(failing)).toEqual({ ok: false, detail: "the public file was updated but could not be checked afterwards; nothing was recorded, and the next run will check the file and record it" });
      expect(d.updates).toEqual([]);
    }
  });
});

describe("M-5: the step's database calls are bounded", () => {
  it("every read, count and update carries an abort signal that has not fired", async () => {
    const d = fakeAnchorDb({ rows: [...published(D[0]!), ...rowsFor(D[1]!)] });
    await publishAnchors(anchorDeps(d.db, fakeAnchor({ files: { [FILE]: fileOf(D[0]!) } }), NOW));
    const ops = new Set(d.signals.map((s) => s.op));
    expect(ops).toEqual(new Set(["select", "update"]));
    expect(d.signals.length).toBeGreaterThanOrEqual(4); // first and last date, the year's rows, the record
    for (const s of d.signals) expect(s.signal).toBeInstanceOf(AbortSignal);
    const off = fakeAnchorDb({ rows: published(D[0]!) });
    await settle(publishAnchors(anchorDeps(off.db, fakeAnchor({ readAll: () => NOT_CONFIGURED }), NOW)));
    expect(off.signals.map((s) => s.op)).toContain("count");
    expect(off.signals.every((s) => s.signal instanceof AbortSignal)).toBe(true);
  });

  it("a read that never answers ends the step within its budget with a plain reason", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(D[0]!), hangReads: true });
    const r = await settle(publishAnchors(anchorDeps(d.db, fakeAnchor({}), NOW), 1500));
    expect(r).toEqual({ ok: false, detail: "ran out of time reading the ledger; nothing was published" });
  }, 10_000);

  it("no read is started once the budget is spent: the step ends before the public file is asked", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(D[0]!) });
    const port = fakeAnchor({});
    const r = await settle(publishAnchors(anchorDeps(d.db, port, NOW), 500));
    expect(r).toEqual({ ok: false, detail: "ran out of time reading the public file; nothing was published" });
    expect(port.calls).toEqual([]);
  });

  it("the recording update has its own short limit and is attempted even when the budget is spent", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(D[0]!) });
    let t = 0;
    const port = fakeAnchor({ onCall: (kind) => { if (kind === "write") t += 1000; } });
    // After the write only 500 ms of a 1,500 ms budget are left; the check read needs 1,000, so use a roomy budget but a late clock.
    await publishAnchors(anchorDeps(d.db, port, NOW, () => t), 3000);
    const update = d.signals.find((s) => s.op === "update");
    expect(update?.signal.aborted).toBe(false);
  });
});

describe("M-6: the publication time is never before the row was created", () => {
  it("a database clock ahead of the function's: the later of the two is sent, so the guard does not refuse a line that is in the file", async () => {
    const ahead = "2026-10-13T02:00:05.000Z"; // 5 s after the function's clock
    const d = fakeAnchorDb({ rows: [{ ...rowsFor(D[0]!)[0]!, createdAt: ahead }, ...rowsFor(D[1]!)] });
    expect(await publishAnchors(anchorDeps(d.db, fakeAnchor({}), NOW))).toMatch(/added 2 days/);
    expect(d.published()).toEqual([D[0], D[1]]);
    expect(d.updates[0]?.published_at).toBe(ahead);
  });

  it("with an ordinary clock the function's own time is sent", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(D[0]!) });
    await publishAnchors(anchorDeps(d.db, fakeAnchor({}), NOW));
    expect(d.updates[0]?.published_at).toBe(NOW.toISOString());
  });
});

describe("M-8: paths the first version did not test", () => {
  it("more than 100 lines at once: recorded in chunks, a crash between two chunks is settled by the next run with no second write", async () => {
    const dates = Array.from({ length: 250 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    const NEXT_DAY = new Date("2026-10-13T02:00:00Z");
    let crash = true;
    const d = fakeAnchorDb({ rows: rowsFor(...dates), beforeUpdate: (n) => { if (crash && n === 1) throw new Error("crash between chunks"); } });
    const port = fakeAnchor({});
    await expect(publishAnchors(anchorDeps(d.db, port, NEXT_DAY))).rejects.toThrow("crash between chunks");
    expect(port.files.get(FILE)).toBe(fileOf(...dates));
    expect(d.published()).toEqual(dates.slice(0, 100));
    crash = false;
    const writes = port.writes().length;
    expect(await publishAnchors(anchorDeps(d.db, port, NEXT_DAY))).toBe("sealed 0 days; recorded 150 days already in the public copy");
    expect(port.writes()).toHaveLength(writes);
    expect(d.published()).toEqual(dates);
    expect(d.updates.map((u) => u.dates.length)).toEqual([100, 100, 50]);
  });

  it("two years in one run: the older year's settled lines are recorded with the version read, the newer year's with the version written", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-12-31", "2027-01-01") });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-12-31") } });
    expect(await publishAnchors(anchorDeps(d.db, port, new Date("2027-01-02T02:00:00Z")))).toBe(
      "sealed 0 days; added 1 day to the public copy (2027-01-01); recorded 1 day already in the public copy",
    );
    expect(d.updates.map((u) => [u.dates, u.anchor_version])).toEqual([[["2026-12-31"], "v0"], [["2027-01-01"], "v1"]]);
  });

  it("two years where the write fails: the other year's settled line is not recorded either", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-12-31", "2027-01-01") });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-12-31") }, write: () => ({ kind: "provider_error", message: "x" }) });
    expect((await settle(publishAnchors(anchorDeps(d.db, port, new Date("2027-01-02T02:00:00Z"))))).ok).toBe(false);
    expect(d.updates).toEqual([]);
  });

  it("a write that is ok with continuity unknown is recorded like any ok", async () => {
    const d = fakeAnchorDb({ rows: rowsFor(D[0]!) });
    const port = fakeAnchor({ write: () => ({ kind: "ok", version: "v7", continuity: "unknown" }) });
    expect(await publishAnchors(anchorDeps(d.db, port, NOW))).toMatch(/added 1 day/);
    expect(d.updates.map((u) => u.anchor_version)).toEqual(["v7"]);
  });

  it("the fake port refuses what the real one refuses (a text that does not begin with `expected` never reaches the step's answer as ok)", async () => {
    const port = fakeAnchor({ files: { [FILE]: "a\nb\n" } });
    expect(await port.write(FILE, "a\n", { expected: "a\nb\n" })).toMatchObject({ kind: "invalid_request" });
    expect(await port.write(FILE, "x\nb\nc\n", { expected: "a\nb\n" })).toMatchObject({ kind: "invalid_request" });
    expect(await port.write(FILE, "a\nb\n", { expected: "a\nb\n" })).toEqual({ kind: "nothing_to_add" });
    expect(port.files.get(FILE)).toBe("a\nb\n");
  });
});

describe("wording of the new messages", () => {
  it("none says or implies proof, tampering, security or a guarantee", async () => {
    const texts: string[] = [];
    const off = await settle(publishAnchors(anchorDeps(fakeAnchorDb({ rows: published(D[0]!) }).db, fakeAnchor({ readAll: () => NOT_CONFIGURED }), NOW)));
    texts.push(off.detail);
    texts.push((await settle(publishAnchors(anchorDeps(fakeAnchorDb({}).db, fakeAnchor({ files: { [FILE]: fileOf(D[0]!) } }), NOW)))).detail);
    const a = fakeAnchorDb({ rows: rowsFor(...D) });
    const port = fakeAnchor({});
    await publishAnchors(anchorDeps(a.db, port, NOW));
    const stale = { ...port, readAll: async (): Promise<AnchorReadAll> => ({ kind: "ok", files: new Map(), version: null }) };
    texts.push((await settle(publishAnchors(anchorDeps(fakeAnchorDb({ rows: rowsFor(...D) }).db, stale, NOW)))).detail);
    expect(texts.every((t) => t.length > 20)).toBe(true);
    for (const text of texts) expect(text).not.toMatch(/tamper|cannot be (altered|changed)|prove|proof|guarantee|secure/i);
  });
});
