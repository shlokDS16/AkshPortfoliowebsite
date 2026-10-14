import { describe, expect, it } from "vitest";
import { createAnchorPort, type AnchorPort } from "@/lib/providers";
import type { Db } from "@/lib/supabase/types";
import { publishAnchors, type AnchorJobDeps } from "./ledger-anchor";
import { anchorDeps, fakeAnchor, fakeAnchorDb, fileOf, lineFor, rowsFor, type FakeAnchor } from "./ledger-anchor-test-kit";

// The happy paths and the repair paths of ledger:anchor (the refusals are in ledger-anchor-refusals.test.ts).

const FILE = "ledger-2026.jsonl";
const NOW = new Date("2026-10-13T02:00:00Z");

const depsFor = (db: Db, port: AnchorPort | (() => AnchorPort), clock = () => 0): AnchorJobDeps => anchorDeps(db, port, NOW, clock);

describe("ledger:anchor with the public copy switched off (the default)", () => {
  it("seals, succeeds, makes no write and says how many days wait", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01"), sealAdds: rowsFor("2026-10-02", "2026-10-03") });
    const port = createAnchorPort({});
    expect(port.name).toBe("off");
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 2 days; the public copy is off, 3 days waiting");
    expect(d.updates).toEqual([]);
    expect(d.published()).toEqual([]);
  });

  it("with an off port that answers not_configured and nothing sealed yet, it still succeeds", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01") });
    const port = fakeAnchor({ name: "off", readAll: () => ({ kind: "not_configured" }) });
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; the public copy is off, 1 day waiting");
    expect(port.writes()).toEqual([]);
  });

  it("has nothing to publish when no day has been sealed and the public file holds nothing (it is still read, once)", async () => {
    const d = fakeAnchorDb({});
    const port = fakeAnchor({});
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; no finished day to publish yet");
    expect(port.calls.map((c) => c.kind)).toEqual(["readAll"]);
  });
});

describe("ledger:anchor publishing", () => {
  it("first publication creates the file with every waiting line and records them with the version", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01", "2026-10-02"), sealAdds: rowsFor("2026-10-03") });
    const port = fakeAnchor({});
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 1 day; added 3 days to the public copy (2026-10-01 to 2026-10-03)");
    expect(port.writes()).toHaveLength(1);
    expect(port.writes()[0]).toMatchObject({ file: FILE, expected: null, text: fileOf("2026-10-01", "2026-10-02", "2026-10-03") });
    expect(port.files.get(FILE)).toBe(fileOf("2026-10-01", "2026-10-02", "2026-10-03"));
    expect(d.published()).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(d.updates.map((u) => u.anchor_version)).toEqual(["v1"]);
    expect(d.updates[0]?.published_at).toBe(NOW.toISOString());
  });

  it("an ordinary day appends one line to exactly the text that was read", async () => {
    const before = fileOf("2026-10-01", "2026-10-02");
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01", "2026-10-02").map((r) => ({ ...r, published: true })), sealAdds: rowsFor("2026-10-03") });
    const port = fakeAnchor({ files: { [FILE]: before } });
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 1 day; added 1 day to the public copy (2026-10-03)");
    expect(port.writes()[0]).toMatchObject({ expected: before, text: `${before}${lineFor("2026-10-03")}\n` });
    expect(d.published()).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0]?.dates).toEqual(["2026-10-03"]);
  });

  it("with nothing to add it writes and records nothing", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01").map((r) => ({ ...r, published: true })) });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-10-01") } });
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; the public copy is up to date");
    expect(port.writes()).toEqual([]);
    expect(d.updates).toEqual([]);
  });

  it("a second run the same day changes nothing", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01"), sealAdds: rowsFor("2026-10-02") });
    const port = fakeAnchor({});
    const deps = depsFor(d.db, port);
    await publishAnchors(deps);
    const snapshot = { file: port.files.get(FILE), updates: d.updates.length, writes: port.writes().length };
    expect(await publishAnchors(deps)).toBe("sealed 0 days; the public copy is up to date");
    expect({ file: port.files.get(FILE), updates: d.updates.length, writes: port.writes().length }).toEqual(snapshot);
  });

  it("the port's nothing_to_add is a success and records nothing by itself", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01") });
    const port = fakeAnchor({ write: () => ({ kind: "nothing_to_add" }) });
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; the public copy was already up to date");
    expect(d.updates).toEqual([]);
  });

  it("a year boundary: the finished year is complete, the new year's file is created on its own", async () => {
    const d = fakeAnchorDb({
      rows: [...rowsFor("2026-12-30", "2026-12-31").map((r) => ({ ...r, published: true })), ...rowsFor("2027-01-01")],
    });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-12-30", "2026-12-31") } });
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; added 1 day to the public copy (2027-01-01)");
    expect(port.writes().map((w) => [w.file, w.expected])).toEqual([["ledger-2027.jsonl", null]]);
    expect(port.reads().map((c) => c.kind)).toEqual(["readAll", "readAll"]); // the one read of the gist, and the check after the write
  });

  it("after a long time off, one file is written a run, oldest year first, and the rest waits", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-12-31", "2027-01-01", "2027-01-02") });
    const port = fakeAnchor({});
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; added 1 day to the public copy (2026-12-31); 2 days waiting for the next run");
    expect(port.writes()).toHaveLength(1);
    expect(d.published()).toEqual(["2026-12-31"]);
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; added 2 days to the public copy (2027-01-01 to 2027-01-02)");
    expect(d.published()).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("records only lines the comparison or the write confirmed, never an older unmarked line outside the file's tail", async () => {
    const d = fakeAnchorDb({ rows: [{ ...rowsFor("2026-10-01")[0]!, published: true }, ...rowsFor("2026-10-02", "2026-10-03")] });
    const port = fakeAnchor({ files: { [FILE]: fileOf("2026-10-01") } });
    await publishAnchors(depsFor(d.db, port));
    expect(d.updates.flatMap((u) => u.dates)).toEqual(["2026-10-02", "2026-10-03"]);
  });
});

describe("ledger:anchor repairs itself after a crash between any two of its steps", () => {
  const written = (port: FakeAnchor) => port.files.get(FILE);

  it("a crash after the write and before the record: the next run sees the lines in the file and only marks them", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01", "2026-10-02") });
    const port = fakeAnchor({});
    const crashing = fakeAnchorDb({ rows: rowsFor("2026-10-01", "2026-10-02"), updateError: { message: "connection lost", code: "08006" } });
    await expect(publishAnchors(depsFor(crashing.db, port))).rejects.toThrow("ledger.recordPublished (08006)");
    expect(written(port)).toBe(fileOf("2026-10-01", "2026-10-02")); // written, not recorded
    expect(crashing.published()).toEqual([]);
    // next day: the database is healthy again
    const writes = port.writes().length;
    expect(await publishAnchors(depsFor(d.db, port))).toBe("sealed 0 days; recorded 2 days already in the public copy");
    expect(port.writes()).toHaveLength(writes); // nothing is sent twice
    expect(d.published()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("an unconfirmed write whose file DID change: nothing recorded now, marked by the next run's read, no second write", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01") });
    const lost = fakeAnchor({ write: () => ({ kind: "unconfirmed", message: "the update may or may not have been applied" }) });
    await expect(publishAnchors(depsFor(d.db, lost))).rejects.toThrow(/result is not known; nothing was recorded/);
    expect(d.updates).toEqual([]);
    const next = fakeAnchor({ files: { [FILE]: fileOf("2026-10-01") } });
    expect(await publishAnchors(depsFor(d.db, next))).toBe("sealed 0 days; recorded 1 day already in the public copy");
    expect(next.writes()).toEqual([]);
  });

  it("an unconfirmed write whose file did NOT change: the next run appends the same lines", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01") });
    let first = true;
    const lost = fakeAnchor({ write: () => (first ? ((first = false), { kind: "unconfirmed", message: "x" }) : undefined), applyWrite: false });
    await expect(publishAnchors(depsFor(d.db, lost))).rejects.toThrow();
    expect(lost.files.size).toBe(0);
    expect(await publishAnchors(depsFor(d.db, lost))).toMatch(/added 1 day/);
    expect(lost.files.get(FILE)).toBe(fileOf("2026-10-01"));
    expect(d.published()).toEqual(["2026-10-01"]);
  });

  it("an interrupted write records nothing; the next run reads the file, finds our lines, and marks them", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01") });
    const port = fakeAnchor({ write: () => ({ kind: "interrupted", version: "v9" }) });
    await expect(publishAnchors(depsFor(d.db, port))).rejects.toThrow(/another change to the public file was seen/);
    expect(d.updates).toEqual([]);
    const next = fakeAnchor({ files: { [FILE]: written(port) as string } });
    expect(await publishAnchors(depsFor(d.db, next))).toBe("sealed 0 days; recorded 1 day already in the public copy");
  });

  it("a crash between sealing and publishing leaves sealed, waiting days that the next run publishes", async () => {
    const d = fakeAnchorDb({ rows: rowsFor("2026-10-01"), sealAdds: rowsFor("2026-10-02") });
    await expect(publishAnchors(depsFor(d.db, () => { throw new Error("boom"); }))).rejects.toThrow(/not set up correctly/);
    expect(d.rows).toHaveLength(2); // sealed
    expect(await publishAnchors(depsFor(d.db, fakeAnchor({})))).toMatch(/added 2 days/);
  });
});
