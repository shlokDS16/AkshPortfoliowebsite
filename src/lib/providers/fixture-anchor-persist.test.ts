import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOffAnchor } from "./anchor";
import { clearFixtureAnchorDirectory, createFixtureAnchor, fixtureAnchorDirectory, resetFixtureAnchor } from "./fixture-anchor";
import { createAnchorPort } from "./index";

const FILE = "ledger-2026.jsonl";

describe("readAll on the fixture and the off adapter", () => {
  beforeEach(() => resetFixtureAnchor());

  it("the fixture returns every file it holds in one call, and none when empty", async () => {
    const port = createFixtureAnchor();
    expect(await port.readAll()).toEqual({ kind: "ok", files: new Map(), version: null });
    await port.write(FILE, "a\n", { expected: null });
    await port.write("ledger-2027.jsonl", "b\n", { expected: null });
    expect(await port.readAll()).toEqual({ kind: "ok", files: new Map([[FILE, "a\n"], ["ledger-2027.jsonl", "b\n"]]), version: "fixture-2" });
  });

  it("the off adapter answers not_configured", async () => {
    expect(await createOffAnchor().readAll()).toEqual({ kind: "not_configured" });
  });
});

describe("the fixture anchor kept in a directory (the double survives a server restart, as a real gist does)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fixture-anchor-test-"));
    resetFixtureAnchor();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("a second instance, and a process that lost its memory, still see what was written, with the version counter", async () => {
    await createFixtureAnchor({ directory: dir }).write(FILE, "a\n", { expected: null });
    resetFixtureAnchor(); // the in-memory store is not what a directory-backed port reads
    const again = createFixtureAnchor({ directory: dir });
    expect(await again.read(FILE)).toEqual({ kind: "ok", text: "a\n", version: "fixture-1" });
    expect(await again.write(FILE, "a\nb\n", { expected: "a\n" })).toMatchObject({ kind: "ok", version: "fixture-2" });
    expect(await createFixtureAnchor({ directory: dir }).readAll()).toMatchObject({ kind: "ok", files: new Map([[FILE, "a\nb\n"]]) });
  });

  it("keeps the same rules as the in-memory one: append-only, precondition, nothing_to_add", async () => {
    const port = createFixtureAnchor({ directory: dir });
    await port.write(FILE, "a\nb\n", { expected: null });
    expect(await port.write(FILE, "a\n", { expected: "a\nb\n" })).toMatchObject({ kind: "invalid_request" });
    expect(await port.write(FILE, "z\n", { expected: null })).toMatchObject({ kind: "changed", found: "a\nb\n" });
    expect(await port.write(FILE, "a\nb\n", { expected: "a\nb\n" })).toEqual({ kind: "nothing_to_add" });
  });

  it("the directory is named from the database address, so two local databases never share a gist", () => {
    const a = fixtureAnchorDirectory("http://127.0.0.1:54321");
    expect(a).toBe(fixtureAnchorDirectory("http://127.0.0.1:54321"));
    expect(a).not.toBe(fixtureAnchorDirectory("http://127.0.0.1:55321"));
    expect(a.startsWith(tmpdir())).toBe(true);
  });

  it("clearing the directory empties the gist (a new database starts with a new gist), and clearing twice is fine", async () => {
    await createFixtureAnchor({ directory: dir }).write(FILE, "a\n", { expected: null });
    clearFixtureAnchorDirectory(dir);
    expect(await createFixtureAnchor({ directory: dir }).read(FILE)).toEqual({ kind: "absent", what: "file" });
    clearFixtureAnchorDirectory(dir);
  });

  it("createAnchorPort builds the directory-backed double for the local stack, so a restarted server still sees its file", async () => {
    const env = { LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999" } as const;
    const where = fixtureAnchorDirectory(env.NEXT_PUBLIC_SUPABASE_URL);
    clearFixtureAnchorDirectory(where);
    try {
      await createAnchorPort(env).write(FILE, "a\n", { expected: null });
      resetFixtureAnchor();
      expect(await createAnchorPort(env).read(FILE)).toMatchObject({ kind: "ok", text: "a\n" });
    } finally {
      clearFixtureAnchorDirectory(where);
    }
  });

  it("a damaged store file reads as an empty gist, never a thrown error", async () => {
    writeFileSync(join(dir, "fixture-anchor.json"), "{ not json");
    expect(await createFixtureAnchor({ directory: dir }).read(FILE)).toEqual({ kind: "absent", what: "file" });
  });
});
