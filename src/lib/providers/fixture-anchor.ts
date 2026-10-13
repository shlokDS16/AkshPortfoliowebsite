import { type AnchorPort, anchorFileProblem, anchorWriteGate } from "./anchor";

// The fixture anchor: local e2e and CI only. createAnchorPort creates it only when the Supabase URL is a loopback address.
// No network. The store lives on globalThis, so the next cron call (which builds a new port) sees what the last one wrote,
// as a real gist would; `resetFixtureAnchor` empties it and restarts the version counter, so every run is the same.

type Store = { files: Map<string, { text: string; version: string }>; counter: number };
const KEY = Symbol.for("aksh-research-desk.fixture-anchor");
const store = (): Store => {
  const holder = globalThis as unknown as Record<symbol, Store | undefined>;
  return (holder[KEY] ??= { files: new Map(), counter: 0 });
};

export function resetFixtureAnchor(): void {
  const s = store();
  s.files.clear();
  s.counter = 0;
}

/** Puts a file in place as if it had been committed (for tests of a gist someone edited by hand). */
export function seedFixtureAnchor(file: string, text: string): void {
  const s = store();
  s.files.set(file, { text, version: `fixture-${++s.counter}` });
}

export function peekFixtureAnchor(file: string): string | null {
  return store().files.get(file)?.text ?? null;
}

export function createFixtureAnchor(): AnchorPort {
  return {
    name: "fixture",
    publicUrl: "https://example.invalid/fixture-anchor",
    async read(file) {
      const problem = anchorFileProblem(file);
      if (problem) return { kind: "invalid_request", message: problem };
      const held = store().files.get(file);
      return held ? { kind: "ok", text: held.text, version: held.version } : { kind: "absent", what: "file" };
    },
    async write(file, text, call) {
      // The same gate as the real adapter: append-only, and a text equal to the expected one is nothing to add.
      const gate = anchorWriteGate(file, text, call.expected);
      if (gate) return gate;
      const s = store();
      const held = s.files.get(file);
      if ((held?.text ?? null) !== call.expected) return { kind: "changed", found: held?.text ?? null, version: held?.version ?? null };
      const version = `fixture-${++s.counter}`;
      s.files.set(file, { text, version });
      return { kind: "ok", version, continuity: "unbroken" };
    },
  };
}
