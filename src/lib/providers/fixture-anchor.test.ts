import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureAnchor, peekFixtureAnchor, resetFixtureAnchor, seedFixtureAnchor } from "./fixture-anchor";

const FILE = "ledger-2026.jsonl";

describe("the fixture anchor (local e2e and CI; an in-process store, no network)", () => {
  beforeEach(() => resetFixtureAnchor());

  it("starts empty: the file is absent, and a first write expects null", async () => {
    const port = createFixtureAnchor();
    expect(port.name).toBe("fixture");
    expect(await port.read(FILE)).toEqual({ kind: "absent", what: "file" });
    expect(await port.write(FILE, "a\n", { expected: null })).toEqual({ kind: "ok", version: "fixture-1", wrote: true, continuity: "unbroken" });
    expect(await port.read(FILE)).toEqual({ kind: "ok", text: "a\n", version: "fixture-1" });
  });

  it("is deterministic: versions count up from fixture-1 after a reset", async () => {
    const port = createFixtureAnchor();
    await port.write(FILE, "a\n", { expected: null });
    expect(await port.write(FILE, "a\nb\n", { expected: "a\n" })).toMatchObject({ version: "fixture-2" });
    resetFixtureAnchor();
    expect(await port.write(FILE, "x\n", { expected: null })).toMatchObject({ version: "fixture-1" });
  });

  it("keeps its state across instances in one process (each cron call builds a new port)", async () => {
    await createFixtureAnchor().write(FILE, "a\n", { expected: null });
    expect(await createFixtureAnchor().read(FILE)).toMatchObject({ kind: "ok", text: "a\n" });
  });

  it("honours the precondition exactly, and answers what it found", async () => {
    const port = createFixtureAnchor();
    await port.write(FILE, "a\n", { expected: null });
    expect(await port.write(FILE, "z\n", { expected: "A\n" })).toEqual({ kind: "changed", found: "a\n", version: "fixture-1" });
    expect(await port.write(FILE, "z\n", { expected: null })).toEqual({ kind: "changed", found: "a\n", version: "fixture-1" });
    expect(await port.read(FILE)).toMatchObject({ text: "a\n" });
  });

  it("writing what is already there sends nothing", async () => {
    const port = createFixtureAnchor();
    await port.write(FILE, "a\n", { expected: null });
    expect(await port.write(FILE, "a\n", { expected: "a\n" })).toEqual({ kind: "ok", version: "fixture-1", wrote: false, continuity: "unbroken" });
  });

  it("seeding stands in for a hand-edited gist (tests of the anchor step)", async () => {
    seedFixtureAnchor(FILE, "tampered\n");
    expect(await createFixtureAnchor().read(FILE)).toMatchObject({ kind: "ok", text: "tampered\n" });
    expect(peekFixtureAnchor(FILE)).toBe("tampered\n");
  });

  it("applies the same input rules as the real adapter", async () => {
    const port = createFixtureAnchor();
    expect(await port.read("../x")).toMatchObject({ kind: "invalid_request" });
    expect(await port.write(FILE, "", { expected: null })).toMatchObject({ kind: "invalid_request" });
    expect(await port.write(FILE, "x".repeat(1_000_001), { expected: null })).toMatchObject({ kind: "invalid_request" });
  });

  it("has a public address that is plainly not a real gist", () => {
    expect(createFixtureAnchor().publicUrl).toBe("https://example.invalid/fixture-anchor");
  });
});
