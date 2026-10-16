import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BroadcastStatus, Contact, LetterResult, LetterTransport, OutgoingEmail } from "./letters";

// The fixture letters transport (Phase 5c, spec s9.4): local e2e and CI only. createLetterPorts creates it only with
// DISTRIBUTION_ADAPTER=fixture and never on a Vercel preview or production deployment, and wraps it in the same approval guard as
// the real one. It never calls the network. It keeps what it was asked to send, so the e2e can assert that exactly the approved
// emails were "sent" and none before the press. Two homes, as fixture-anchor.ts:
//  - in memory (globalThis), the default, for unit tests; `resetFixtureLetters()` empties it;
//  - in a directory (`opts.directory`), which createLetterPorts sets against a local database, so the Playwright runner (another
//    process) can read what the dev server "sent" (`peekFixtureLetters({ directory })`).
// It behaves like Resend where a test depends on it: a repeated idempotency key is dropped, a broadcast is a draft until sent and
// goes to the segment's subscribed contacts only, a broadcast cannot be sent twice, adding a contact never clears `unsubscribed`.

export const FIXTURE_SEGMENT_ID = "00000000-0000-4000-8000-00000000f1e7";
const KEY = Symbol.for("aksh-research-desk.fixture-letters");
const STORE_FILE = "fixture-letters.json";

export type FixtureEmail = OutgoingEmail;
export type FixtureBroadcast = {
  id: string;
  name: string;
  segmentId: string;
  subject: string;
  html: string;
  text: string;
  status: Extract<BroadcastStatus, "draft" | "sent">;
  /** The addresses it was delivered to when sent; empty while a draft. */
  recipients: string[];
};
export type FixtureLetters = { emails: FixtureEmail[]; broadcasts: FixtureBroadcast[]; contacts: Contact[] };
type Where = { directory?: string };

const empty = (): FixtureLetters => ({ emails: [], broadcasts: [], contacts: [] });
const memory = (): FixtureLetters => {
  const holder = globalThis as unknown as Record<symbol, FixtureLetters | undefined>;
  return (holder[KEY] ??= empty());
};

function load(where: Where): FixtureLetters {
  if (!where.directory) return memory();
  try {
    const raw = JSON.parse(readFileSync(join(where.directory, STORE_FILE), "utf8")) as Partial<FixtureLetters>;
    return { emails: raw.emails ?? [], broadcasts: raw.broadcasts ?? [], contacts: raw.contacts ?? [] };
  } catch {
    return empty(); // absent or damaged: nothing sent yet
  }
}

function save(where: Where, store: FixtureLetters): void {
  if (!where.directory) return; // the memory store is the object itself
  mkdirSync(where.directory, { recursive: true });
  const target = join(where.directory, STORE_FILE);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store));
  renameSync(temporary, target);
}

/** Reads, changes and writes the store in one step. */
function update<T>(where: Where, change: (store: FixtureLetters) => T): T {
  const store = load(where);
  const out = change(store);
  save(where, store);
  return out;
}

/** The directory that holds the fixture letters of the local database at this address. */
export function fixtureLettersDirectory(supabaseUrl: string): string {
  return join(tmpdir(), "aksh-research-desk-fixture-letters", createHash("sha256").update(supabaseUrl).digest("hex").slice(0, 16));
}

/** A copy of everything "sent" so far. */
export function peekFixtureLetters(where: Where = {}): FixtureLetters {
  return structuredClone(load(where));
}

export function resetFixtureLetters(where: Where = {}): void {
  if (where.directory) {
    rmSync(where.directory, { recursive: true, force: true });
    return;
  }
  Object.assign(memory(), empty());
}

/** What a reader's press on Resend's unsubscribe link does (for the e2e and the reconcile tests). */
export function unsubscribeFixtureContact(email: string, where: Where = {}): void {
  update(where, (s) => {
    for (const c of s.contacts) if (c.email === email.trim().toLowerCase()) c.unsubscribed = true;
  });
}

const ok = <T>(value: T): LetterResult<T> => ({ ok: true, value });

export function createFixtureLetters(opts: { segmentId?: string; directory?: string } = {}): LetterTransport {
  const segmentId = opts.segmentId ?? FIXTURE_SEGMENT_ID;
  const where: Where = opts.directory ? { directory: opts.directory } : {};

  return {
    name: "fixture",
    segmentId,
    async sendOne(email) {
      return update(where, (s) => {
        if (!s.emails.some((e) => e.idempotencyKey === email.idempotencyKey)) s.emails.push({ ...email, to: email.to.trim().toLowerCase() });
        return ok({ id: randomUUID() });
      });
    },
    async createBroadcast(draft) {
      return update(where, (s) => {
        const id = randomUUID();
        s.broadcasts.push({ id, segmentId, ...draft, status: "draft", recipients: [] });
        return ok({ id });
      });
    },
    async getBroadcast(id) {
      const b = load(where).broadcasts.find((x) => x.id === id);
      return b ? ok({ id, name: b.name, segmentId: b.segmentId, status: b.status }) : { ok: false, kind: "not_found", message: "Resend answered 404" };
    },
    async sendBroadcast(id) {
      return update(where, (s): LetterResult<null> => {
        const b = s.broadcasts.find((x) => x.id === id);
        if (!b) return { ok: false, kind: "not_found", message: "Resend answered 404" };
        if (b.status !== "draft") return { ok: false, kind: "refused", message: "Resend answered 422: the broadcast is not a draft" };
        b.status = "sent";
        b.recipients = s.contacts.filter((c) => !c.unsubscribed).map((c) => c.email);
        return ok(null);
      });
    },
    async listContacts() {
      return ok(structuredClone(load(where).contacts));
    },
    async upsertContact(email) {
      return update(where, (s) => {
        const lower = email.trim().toLowerCase();
        if (!s.contacts.some((c) => c.email === lower)) s.contacts.push({ id: randomUUID(), email: lower, unsubscribed: false });
        return ok(null);
      });
    },
    async deleteContact(email) {
      return update(where, (s) => {
        s.contacts = s.contacts.filter((c) => c.email !== email.trim().toLowerCase());
        return ok(null);
      });
    },
  };
}
