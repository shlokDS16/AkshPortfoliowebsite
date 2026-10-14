import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AnchorPort, anchorFileProblem, anchorWriteGate } from "./anchor";

// The fixture anchor: local e2e and CI only. createAnchorPort creates it only when the Supabase URL is a loopback address.
// No network. Two homes for its files, the same rules for both:
//  - in memory (globalThis), the default: the next cron call, which builds a new port, sees what the last one wrote, as a real
//    gist would; `resetFixtureAnchor` empties it and restarts the version counter, so unit tests are deterministic;
//  - in a directory (`opts.directory`), which createAnchorPort sets for the local stack: a real gist outlives the app, and so
//    must this double, or a restarted dev server would forget lines the database remembers as published and the step would
//    (rightly) refuse. The directory is keyed by the database address (`fixtureAnchorDirectory`), so it is consistent with ONE
//    local database; a new database (`pnpm db:reset`) is a new world, and the e2e global setup clears the directory then.

type Held = { text: string; version: string };
type Store = { files: Map<string, Held>; counter: number };
const KEY = Symbol.for("aksh-research-desk.fixture-anchor");
const STORE_FILE = "fixture-anchor.json";

const memory = (): Store => {
  const holder = globalThis as unknown as Record<symbol, Store | undefined>;
  return (holder[KEY] ??= { files: new Map(), counter: 0 });
};

function load(directory: string): Store {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(directory, STORE_FILE), "utf8"));
    const value = raw as { counter?: unknown; files?: Record<string, { text?: unknown; version?: unknown }> };
    const files = new Map<string, Held>();
    for (const [name, held] of Object.entries(value.files ?? {})) {
      if (typeof held?.text === "string" && typeof held.version === "string") files.set(name, { text: held.text, version: held.version });
    }
    return { files, counter: typeof value.counter === "number" ? value.counter : files.size };
  } catch {
    return { files: new Map(), counter: 0 }; // absent or damaged: an empty gist
  }
}

function save(directory: string, store: Store): void {
  mkdirSync(directory, { recursive: true });
  const target = join(directory, STORE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ counter: store.counter, files: Object.fromEntries(store.files) }));
  renameSync(temporary, target);
}

/** The directory that holds the fixture gist of the local database at this address. */
export function fixtureAnchorDirectory(supabaseUrl: string): string {
  return join(tmpdir(), "aksh-research-desk-fixture-anchor", createHash("sha256").update(supabaseUrl).digest("hex").slice(0, 16));
}

/** Empties the gist kept in a directory (a new local database starts with a new gist). */
export function clearFixtureAnchorDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

export function resetFixtureAnchor(): void {
  const s = memory();
  s.files.clear();
  s.counter = 0;
}

/** Puts a file in place as if it had been committed (for tests of a gist someone edited by hand). */
export function seedFixtureAnchor(file: string, text: string, opts: { directory?: string } = {}): void {
  const s = opts.directory ? load(opts.directory) : memory();
  s.files.set(file, { text, version: `fixture-${++s.counter}` });
  if (opts.directory) save(opts.directory, s);
}

export function peekFixtureAnchor(file: string): string | null {
  return memory().files.get(file)?.text ?? null;
}

export function createFixtureAnchor(opts: { directory?: string } = {}): AnchorPort {
  const { directory } = opts;
  const open = (): Store => (directory ? load(directory) : memory());
  const commit = (store: Store): void => {
    if (directory) save(directory, store);
  };
  return {
    name: "fixture",
    publicUrl: "https://example.invalid/fixture-anchor",
    async read(file) {
      const problem = anchorFileProblem(file);
      if (problem) return { kind: "invalid_request", message: problem };
      const held = open().files.get(file);
      return held ? { kind: "ok", text: held.text, version: held.version } : { kind: "absent", what: "file" };
    },
    async readAll() {
      const s = open();
      const files = new Map([...s.files].map(([name, held]) => [name, held.text] as const));
      return { kind: "ok", files, version: s.counter > 0 ? `fixture-${s.counter}` : null };
    },
    async write(file, text, call) {
      // The same gate as the real adapter: append-only, and a text equal to the expected one is nothing to add.
      const gate = anchorWriteGate(file, text, call.expected);
      if (gate) return gate;
      const s = open();
      const held = s.files.get(file);
      if ((held?.text ?? null) !== call.expected) return { kind: "changed", found: held?.text ?? null, version: held?.version ?? null };
      const version = `fixture-${++s.counter}`;
      s.files.set(file, { text, version });
      commit(s);
      return { kind: "ok", version, continuity: "unbroken" };
    },
  };
}
