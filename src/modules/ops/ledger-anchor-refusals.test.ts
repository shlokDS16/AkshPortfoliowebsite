import { describe, expect, it } from "vitest";
import type { AnchorReadAll, AnchorWrite } from "@/lib/providers";
import { publishAnchors } from "./ledger-anchor";
import { anchorDeps, fakeAnchor, fakeAnchorDb, fileOf, lineFor, rowsFor } from "./ledger-anchor-test-kit";

// What ledger:anchor must REFUSE, and how it ends for every outcome of the port (ADR-005 s6, spec s26). In every refusal
// nothing is written to the public file and nothing is recorded as published.

const FILE = "ledger-2026.jsonl";
const NOW = new Date("2026-10-13T02:00:00Z");
const published = (dates: string[]) => rowsFor(...dates).map((r) => ({ ...r, published: true }));
const D = ["2026-10-01", "2026-10-02", "2026-10-03"];

async function run(setup: { rows: ReturnType<typeof rowsFor>; port: ReturnType<typeof fakeAnchor>; clock?: () => number; seal?: Parameters<typeof fakeAnchorDb>[0]["seal"] }) {
  const d = fakeAnchorDb({ rows: setup.rows, seal: setup.seal });
  const outcome = await publishAnchors(anchorDeps(d.db, setup.port, NOW, setup.clock)).then(
    (detail) => ({ ok: true as const, detail }),
    (error: Error) => ({ ok: false as const, detail: error.message }),
  );
  return { d, outcome };
}
const untouched = (r: Awaited<ReturnType<typeof run>>, port: ReturnType<typeof fakeAnchor>, before: string[]) => {
  expect(port.writes()).toEqual([]);
  expect(r.d.updates).toEqual([]);
  expect(r.d.published()).toEqual(before);
};

describe("the published file differs from the ledger: the step refuses", () => {
  it("a line that differs (an edited published line)", async () => {
    const edited = fileOf(...D).replace(lineFor("2026-10-02"), lineFor("2026-10-02").replace('"count":0', '"count":9'));
    const port = fakeAnchor({ files: { [FILE]: edited } });
    const r = await run({ rows: published(D), port });
    expect(r.outcome).toEqual({ ok: false, detail: `the public file ${FILE} differs from the ledger at line 2 (2026-10-02); nothing was published` });
    untouched(r, port, D);
  });

  it("a line that differs inside the part not yet marked published", async () => {
    const port = fakeAnchor({ files: { [FILE]: `${fileOf(D[0]!)}{"forged":true}\n` } });
    const r = await run({ rows: [...published([D[0]!]), ...rowsFor(D[1]!, D[2]!)], port });
    expect(r.outcome.detail).toContain("differs from the ledger at line 2 (2026-10-02)");
    untouched(r, port, [D[0]!]);
  });

  it("an extra published line the database does not have", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D, "2026-10-04") } });
    const r = await run({ rows: published(D), port });
    expect(r.outcome).toEqual({ ok: false, detail: `the public file ${FILE} has a line 4 that the ledger does not have; nothing was published` });
    untouched(r, port, D);
  });

  it("a duplicated published date", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-10-01", "2026-10-01", "2026-10-02") } });
    const r = await run({ rows: published(D), port });
    expect(r.outcome.detail).toContain("differs from the ledger at line 2 (2026-10-02)");
    untouched(r, port, D);
  });

  it("published dates out of order", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-10-02", "2026-10-01") } });
    const r = await run({ rows: published(D.slice(0, 2)), port });
    expect(r.outcome.detail).toContain("line 1 (2026-10-01)");
    untouched(r, port, D.slice(0, 2));
  });

  it("the database holds FEWER lines than were published (deleted rows, or a restore from an older backup): no duplicate dates are appended", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D) } });
    const r = await run({ rows: published(D.slice(0, 2)), port });
    expect(r.outcome.detail).toContain(`the public file ${FILE} has a line 3 that the ledger does not have`);
    untouched(r, port, D.slice(0, 2));
  });

  it("a deleted database row in the middle: the file has the line, the database has the next date there", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf(...D) } });
    const r = await run({ rows: [...published(["2026-10-01"]), ...published(["2026-10-03"])], port });
    expect(r.outcome.detail).toContain("differs from the ledger at line 2 (2026-10-03)");
    untouched(r, port, ["2026-10-01", "2026-10-03"]);
  });

  it("a file shorter than what the database marks as published, or empty, or missing", async () => {
    for (const files of [{ [FILE]: fileOf(D[0]!) }, { [FILE]: "" }, {} as Record<string, string>]) {
      const port = fakeAnchor({ files });
      const r = await run({ rows: published(D), port });
      expect(r.outcome.ok).toBe(false);
      expect(r.outcome.detail).toMatch(/is missing line (1|2) \(2026-10-0[12]\), which was published; nothing was published$/);
      untouched(r, port, D);
    }
  });

  it("a file whose last line has no line break", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf(D[0]!).slice(0, -1) } });
    const r = await run({ rows: rowsFor(D[0]!, D[1]!), port });
    expect(r.outcome.detail).toBe(`the public file ${FILE} does not end with a line break after line 1; nothing was published`);
    untouched(r, port, []);
  });

  it("an older year that differs refuses even when this year is fine", async () => {
    const port = fakeAnchor({ files: { [FILE]: `${fileOf("2026-12-31").replace("12-31", "12-30")}`, "ledger-2027.jsonl": fileOf("2027-01-01") } });
    const r = await run({ rows: [...published(["2026-12-31"]), ...published(["2027-01-01"]), ...rowsFor("2027-01-02")], port });
    expect(r.outcome.detail).toContain(`ledger-2026.jsonl differs from the ledger at line 1 (2026-12-31)`);
    untouched(r, port, ["2026-12-31", "2027-01-01"]);
  });

  it("never copies the file's own text, a token, or the port's message into the reason", async () => {
    const port = fakeAnchor({ files: { [FILE]: "ghp_SECRETSECRETSECRETSECRET123\n" } });
    const r = await run({ rows: published(D), port });
    expect(r.outcome.detail).not.toMatch(/ghp_|SECRET/);
  });
});

describe("every outcome of a READ that is not a good file", () => {
  const cases: [AnchorReadAll, RegExp][] = [
    [{ kind: "unauthorized" }, /^GitHub refused the key; nothing was published$/],
    [{ kind: "rate_limited", retryAfterSeconds: 60 }, /^GitHub is limiting requests; the next daily run will try again; nothing was published$/],
    [{ kind: "too_large" }, /^the public file is too large to be read whole; it will not clear by itself; nothing was published$/],
    [{ kind: "provider_error", message: "ghp_SECRET boom" }, /^the public file could not be reached just now; nothing was published$/],
    [{ kind: "absent", what: "gist" }, /^the gist was not found, check the gist id; nothing was published$/],
    [{ kind: "invalid_request", message: "x" }, /a defect; nothing was published$/],
  ];
  it.each(cases)("%j fails the step with a plain reason, writes nothing, records nothing", async (miss, reason) => {
    const port = fakeAnchor({ readAll: () => miss });
    const r = await run({ rows: rowsFor(D[0]!), port });
    expect(r.outcome.ok).toBe(false);
    expect(r.outcome.detail).toMatch(reason);
    expect(r.outcome.detail).not.toMatch(/SECRET/);
    untouched(r, port, []);
  });

  it("an adapter that throws on read is a provider error, not a lost run", async () => {
    const port = fakeAnchor({ readAll: () => { throw new Error("ghp_SECRET"); } });
    const r = await run({ rows: rowsFor(D[0]!), port });
    expect(r.outcome).toEqual({ ok: false, detail: "the public file could not be reached just now; nothing was published" });
  });
});

describe("every outcome of a WRITE that is not ok", () => {
  const cases: [AnchorWrite, RegExp][] = [
    [{ kind: "changed", found: "ghp_SECRET", version: null }, /^the public file changed while it was being updated; nothing was written or recorded, and the next run will check it again$/],
    [{ kind: "unconfirmed", message: "ghp_SECRET" }, /^the update to the public file was sent and its result is not known; nothing was recorded, and the next run will read the file first$/],
    [{ kind: "interrupted", version: "v7" }, /^another change to the public file was seen while it was being updated; nothing was recorded, and the next run will check the file again$/],
    [{ kind: "cannot_write" }, /^the token cannot write to the gist; nothing was published$/],
    [{ kind: "unauthorized" }, /^GitHub refused the key; nothing was published$/],
    [{ kind: "rate_limited", retryAfterSeconds: null }, /limiting requests/],
    [{ kind: "provider_error", message: "ghp_SECRET" }, /could not be reached just now; nothing was published$/],
    [{ kind: "too_large" }, /too large/],
    [{ kind: "invalid_request", message: "x" }, /a defect; nothing was published$/],
    [{ kind: "absent", what: "gist" }, /gist was not found/],
  ];
  it.each(cases)("%j fails the step and records nothing as published", async (miss, reason) => {
    const port = fakeAnchor({ write: () => miss, applyWrite: false });
    const r = await run({ rows: rowsFor(...D), port });
    expect(r.outcome.ok).toBe(false);
    expect(r.outcome.detail).toMatch(reason);
    expect(r.outcome.detail).not.toMatch(/SECRET/);
    expect(r.d.updates).toEqual([]);
    expect(r.d.published()).toEqual([]);
  });

  it("an adapter that throws on write is treated as unconfirmed: nothing recorded, the next run reads first", async () => {
    const port = fakeAnchor({ write: () => { throw new Error("ghp_SECRET"); } });
    const r = await run({ rows: rowsFor(D[0]!), port });
    expect(r.outcome.detail).toMatch(/result is not known/);
    expect(r.d.updates).toEqual([]);
  });

  it("lines the comparison saw in the file are not recorded when the write for the rest then fails", async () => {
    const port = fakeAnchor({ files: { [FILE]: fileOf(D[0]!) }, write: () => ({ kind: "provider_error", message: "x" }) });
    const r = await run({ rows: rowsFor(...D), port });
    expect(r.outcome.ok).toBe(false);
    expect(r.d.updates).toEqual([]);
  });

  it("the write is given the time left, and is made once with no retry", async () => {
    const port = fakeAnchor({ write: () => ({ kind: "provider_error", message: "x" }) });
    await run({ rows: rowsFor(D[0]!), port });
    expect(port.writes()).toHaveLength(1);
    expect(port.writes()[0]?.timeoutMs).toBeLessThanOrEqual(15_000);
  });
});

describe("the seal and the budget", () => {
  const rows = rowsFor(D[0]!);
  it.each(["chain_broken", "anchor_mismatch"])("%s from the seal fails the step with a plain reason, publishes nothing, asks the port nothing", async (code) => {
    const port = fakeAnchor({});
    const r = await run({ rows, port, seal: { error: { message: `ledger:${code}`, code: "P0001" } } });
    expect(r.outcome).toEqual({ ok: false, detail: `the ledger failed its own check (${code}); nothing was sealed or published` });
    expect(port.calls).toEqual([]);
    untouched(r, port, []);
  });

  it("another database error at the seal is the operation and code only", async () => {
    const r = await run({ rows, port: fakeAnchor({}), seal: { error: { message: "row {secret value} broke", code: "XX000" } } });
    expect(r.outcome).toEqual({ ok: false, detail: "ledger.seal (XX000)" });
  });

  it("a seal that does not return within the budget fails the step", async () => {
    const port = fakeAnchor({});
    const r = await run({ rows, port, seal: "hang" });
    expect(r.outcome.detail).toBe("sealing did not finish within its time limit");
    expect(port.calls).toEqual([]);
  }, 20_000);

  it("a port factory that throws is a plain failure with the setting's name, never a value", async () => {
    const d = fakeAnchorDb({ rows });
    const deps = anchorDeps(d.db, () => { throw new Error("GITHUB_GIST_TOKEN is malformed"); }, NOW);
    await expect(publishAnchors(deps)).rejects.toThrow("the public copy is not set up correctly: GITHUB_GIST_TOKEN is malformed");
  });

  it("stops reading when the budget is spent, before a write", async () => {
    let t = 0;
    const port = fakeAnchor({ onCall: () => { t += 14_500; } });
    const r = await run({ rows, port, clock: () => t });
    expect(r.outcome).toEqual({ ok: false, detail: "ran out of time before updating the public file; nothing was published" });
    expect(port.writes()).toEqual([]);
    expect(r.d.updates).toEqual([]);
  });

  it("passes each call the time that is left", async () => {
    let t = 0;
    const port = fakeAnchor({ onCall: () => { t += 3000; } });
    await run({ rows, port, clock: () => t });
    expect(port.calls.map((c) => c.timeoutMs)).toEqual([7000, 12000, 7000]); // the gist, the write, the check after the write
  });

  it("a database failure while reading the sealed days is the operation and code only", async () => {
    const d = fakeAnchorDb({ rows, readError: { message: "secret row", code: "42501" } });
    await expect(publishAnchors(anchorDeps(d.db, fakeAnchor({}), NOW))).rejects.toThrow("ledger.readAnchors (42501)");
  });
});

describe("wording", () => {
  it("no result or reason says or implies the ledger cannot be altered or proves anything", async () => {
    const texts: string[] = [];
    const record = (r: Awaited<ReturnType<typeof run>>) => texts.push(r.outcome.detail);
    record(await run({ rows: rowsFor(...D), port: fakeAnchor({}) }));
    record(await run({ rows: rowsFor(...D), port: fakeAnchor({ readAll: () => ({ kind: "not_configured" }) }) }));
    record(await run({ rows: published(D), port: fakeAnchor({ files: { [FILE]: "x\n" } }) }));
    for (const kind of ["changed", "unconfirmed", "interrupted"] as const) {
      record(await run({ rows: rowsFor(D[0]!), port: fakeAnchor({ write: () => (kind === "changed" ? { kind, found: null, version: null } : kind === "interrupted" ? { kind, version: null } : { kind, message: "" }) }) }));
    }
    expect(texts.length).toBeGreaterThan(5);
    for (const text of texts) expect(text).not.toMatch(/tamper|cannot be (altered|changed)|prove|proof|guarantee|secure/i);
  });
});
