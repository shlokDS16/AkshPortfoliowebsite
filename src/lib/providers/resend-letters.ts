import type { BroadcastStatus, Contact, LetterFailure, LetterResult, LetterTransport } from "./letters";
import { createResendClient, replyMessage, type ResendReply, type ResendRequest } from "./resend-http";

// The Resend letters transport (Phase 5c, spec s8.8). The ONLY file that names Resend's broadcasts and contacts endpoints (s9.3).
// Callers never hold it: createLetterPorts (index.ts) wraps it in letters-guard.ts, which calls nothing without a live approval.
// Plain fetch through resend-http.ts (shared with the alert mailer): never throws, key never echoed, capped reads, no redirects,
// 10 s timeout. Tested only with an injected fetch; the unit setup refuses the global fetch for resend.com.
//
// Read 2026-10-16 before coding (resend.com/docs/api-reference/..., the .md pages):
//  - emails/send-email: POST /emails { from, to (string or list), subject, html?, text? } -> 200 { id }; header Idempotency-Key
//    (dashboard/emails/idempotency-keys: up to 256 characters, kept 24 h; supported on Send Email and Batch ONLY, not broadcasts).
//  - broadcasts/create-broadcast: POST /broadcasts { segment_id (required; Audiences are now Segments), from, subject, html?,
//    text?, name?, send? (default false: a draft), reply_to?, topic_id?, scheduled_at? } -> { object: "broadcast", id }.
//  - broadcasts/get-broadcast: GET /broadcasts/{id} -> { id, name, segment_id, status, from, subject, html, text, ... }.
//    Statuses (dashboard/broadcasts/manage-broadcasts): draft, scheduled, queued, sent, canceled.
//  - broadcasts/send-broadcast: POST /broadcasts/{id}/send { scheduled_at? } -> { id }. No idempotency key exists for broadcasts,
//    so a retry reads the broadcast first and sends only a draft (letters-guard.ts).
//  - contacts/list-contacts: GET /contacts?segment_id=&limit=(1..100, default 20)&after=<id> -> { object: "list", has_more,
//    data: [{ id, email, first_name, last_name, created_at, unsubscribed }] } (pagination: cursor = an object's id, excluded).
//  - contacts/create-contact: POST /contacts { email, unsubscribed?, segments?: [{ id }], ... } -> { object: "contact", id }.
//  - contacts/add-contact-to-segment: POST /contacts/{id|email}/segments/{segment_id} -> { id }.
//  - contacts/delete-contact: DELETE /contacts/{id|email} -> { object: "contact", contact, deleted: true }.
//  - contacts/update-contact (by id or email, may set `unsubscribed`): NOT used and no update verb is typed in resend-http.ts, so
//    nothing here can undo a reader's unsubscribe.
//  - api-reference/rate-limit: 10 requests a second per team (all keys), 429 with retry-after; daily_quota_exceeded and
//    monthly_quota_exceeded are 429s; the free daily quota is a UTC day; a broadcast over the contact quota is a 403.
//  - api-reference/errors: { statusCode, name, message }; not_found is 404.
// A contact Resend does not have yet answers 404 to add-to-segment (not stated on that page; the conservative reading): it is then
// created in the segment, without the `unsubscribed` field.

export const RESEND_LETTERS_BASE = "https://api.resend.com";
const DEFAULT_TIMEOUT_MS = 10_000;
/** About 8 calls a second at most from this adapter, under the team's 10 (the alert email shares it). */
const DEFAULT_MIN_GAP_MS = 120;
const PAGE = 100;
/** 2,000 contacts: twice the free plan's 1,000. More pages than this is an answer we do not trust. */
const MAX_PAGES = 20;
const BODY_LIMIT = 100_000;

const KEY_SHAPE = /^re_[A-Za-z0-9_-]{6,200}$/;
/** A bare address, or `Name <address>`; group 1 or 2 is the domain. */
const SENDER = /^(?:[^<>]{0,100}<[^\s@<>,;"]+@([^\s@<>,;"]+\.[^\s@<>,;"]+)>|[^\s@<>,;"]+@([^\s@<>,;"]+\.[^\s@<>,;"]+))$/;
const ID = /^[A-Za-z0-9-]{1,100}$/;
const SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS = /^[^\s@<>,;"/?#]+@[^\s@<>,;"/?#]+\.[^\s@<>,;"/?#]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const IDEMPOTENCY_KEY = /^[!-~]{1,256}$/;
const EMAILISH = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g;
const STATUSES = new Set<BroadcastStatus>(["draft", "scheduled", "queued", "sent", "canceled"]);

export type LetterSettings = { apiKey: string; from: string; segmentId: string };

/** The first thing wrong with the three settings, naming the setting and never its value; null when they are usable. */
export function letterSettingsProblem(s: LetterSettings): string | null {
  if (!KEY_SHAPE.test(s.apiKey)) return "RESEND_LETTERS_KEY does not have the shape of a Resend key (re_...)";
  const sender = s.from.length <= 200 && !CONTROL.test(s.from) ? SENDER.exec(s.from.trim()) : null;
  if (!sender) return "LETTERS_FROM must be an address, or Name <address>, on one line";
  if (/(^|\.)resend\.dev$/i.test(sender[1] ?? sender[2] ?? "")) return "LETTERS_FROM must be on your own verified domain, not resend.dev";
  if (!SEGMENT.test(s.segmentId)) return "LETTERS_SEGMENT_ID must be a Resend segment id";
  return null;
}

export type ResendLettersOptions = LetterSettings & {
  fetch?: typeof fetch;
  timeoutMs?: number;
  minGapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const invalid = (message: string): LetterFailure => ({ ok: false, kind: "invalid", message });
const unreadable = (what: string): LetterFailure => ({ ok: false, kind: "unavailable", message: `Resend's answer had no readable ${what}` });
const record = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

export function createResendLetters(opts: ResendLettersOptions): LetterTransport {
  const problem = letterSettingsProblem(opts);
  if (problem) throw new Error(problem);
  const { from, segmentId } = opts;
  const client = createResendClient({ apiKey: opts.apiKey, fetch: opts.fetch ?? fetch, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  const minGap = opts.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = Number.NEGATIVE_INFINITY;

  function failure(reply: Extract<ResendReply, { ok: false }>): LetterFailure {
    // Resend's words may quote an address (a reader's); it is removed like the key.
    const message = replyMessage({ ...reply, said: reply.said?.replace(EMAILISH, "[address]") ?? null });
    if (reply.status === 429) {
      if (reply.name === "daily_quota_exceeded" || reply.name === "monthly_quota_exceeded") return { ok: false, kind: "quota", message };
      return { ok: false, kind: "rate_limited", message, ...(reply.retryAfterSeconds !== null ? { retryAfterSeconds: reply.retryAfterSeconds } : {}) };
    }
    if (reply.status === null || reply.status >= 500) return { ok: false, kind: "unavailable", message };
    return { ok: false, kind: reply.status === 404 ? "not_found" : "refused", message };
  }

  async function call(request: Omit<ResendRequest, "url"> & { path: string }): Promise<ResendReply> {
    const wait = last + minGap - now();
    if (wait > 0) await sleep(wait);
    last = now();
    return client.call({ ...request, url: `${RESEND_LETTERS_BASE}${request.path}` });
  }

  const address = (email: string) => {
    const lower = email.trim().toLowerCase();
    return lower.length <= 254 && ADDRESS.test(lower) ? lower : null;
  };
  const contentProblem = (subject: string, text: string, html?: string) =>
    subject.length < 1 || subject.length > 200 || CONTROL.test(subject) ? "the subject must be 1 to 200 characters on one line"
      : text.length < 1 || text.length > BODY_LIMIT || (html ?? "").length > BODY_LIMIT ? "the email body is empty or too long"
        : null;

  return {
    name: "resend",
    segmentId,

    async sendOne(email) {
      const to = address(email.to);
      if (!to) return invalid("not an email address");
      const bad = contentProblem(email.subject, email.text, email.html);
      if (bad) return invalid(bad);
      if (!IDEMPOTENCY_KEY.test(email.idempotencyKey)) return invalid("the idempotency key is not valid");
      const body = { from, to: [to], subject: email.subject, text: email.text, ...(email.html !== undefined ? { html: email.html } : {}) };
      const reply = await call({ method: "POST", path: "/emails", body, idempotencyKey: email.idempotencyKey, readBody: true });
      if (!reply.ok) return failure(reply);
      const id = record(reply.json).id;
      return { ok: true, value: { id: typeof id === "string" && ID.test(id) ? id : null } };
    },

    async createBroadcast(draft) {
      const bad = contentProblem(draft.subject, draft.text, draft.html) ?? (ID.test(draft.name) ? null : "the broadcast name is not valid");
      if (bad) return invalid(bad);
      const body = { segment_id: segmentId, from, subject: draft.subject, html: draft.html, text: draft.text, name: draft.name, send: false };
      const reply = await call({ method: "POST", path: "/broadcasts", body, readBody: true });
      if (!reply.ok) return failure(reply);
      const id = record(reply.json).id;
      return typeof id === "string" && ID.test(id) ? { ok: true, value: { id } } : unreadable("broadcast id");
    },

    async getBroadcast(id) {
      if (!ID.test(id)) return invalid("not a broadcast id");
      const reply = await call({ method: "GET", path: `/broadcasts/${id}`, readBody: true });
      if (!reply.ok) return failure(reply);
      const b = record(reply.json);
      if (b.id !== id) return unreadable("broadcast");
      const status = typeof b.status === "string" && STATUSES.has(b.status as BroadcastStatus) ? (b.status as BroadcastStatus) : "unknown";
      return {
        ok: true,
        value: { id, name: typeof b.name === "string" ? b.name : null, segmentId: typeof b.segment_id === "string" ? b.segment_id : null, status },
      };
    },

    async sendBroadcast(id) {
      if (!ID.test(id)) return invalid("not a broadcast id");
      const reply = await call({ method: "POST", path: `/broadcasts/${id}/send`, body: {} });
      return reply.ok ? { ok: true, value: null } : failure(reply);
    },

    async listContacts(): Promise<LetterResult<Contact[]>> {
      const out: Contact[] = [];
      let after: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = `segment_id=${segmentId}&limit=${PAGE}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
        const reply = await call({ method: "GET", path: `/contacts?${query}`, readBody: true });
        if (!reply.ok) return failure(reply);
        const body = record(reply.json);
        if (!Array.isArray(body.data) || typeof body.has_more !== "boolean") return unreadable("contact list");
        for (const raw of body.data) {
          const c = record(raw);
          const email = typeof c.email === "string" ? address(c.email) : null;
          if (typeof c.id !== "string" || !ID.test(c.id) || !email || typeof c.unsubscribed !== "boolean") return unreadable("contact list");
          out.push({ id: c.id, email, unsubscribed: c.unsubscribed });
        }
        if (!body.has_more) return { ok: true, value: out };
        const next = out.at(-1)?.id ?? null;
        if (body.data.length === 0 || next === after) return unreadable("contact list");
        after = next;
      }
      return unreadable("contact list (too many pages)");
    },

    async upsertContact(email) {
      const to = address(email);
      if (!to) return invalid("not an email address");
      const added = await call({ method: "POST", path: `/contacts/${encodeURIComponent(to)}/segments/${segmentId}` });
      if (added.ok) return { ok: true, value: null };
      if (added.status !== 404) return failure(added);
      const created = await call({ method: "POST", path: "/contacts", body: { email: to, segments: [{ id: segmentId }] } });
      return created.ok ? { ok: true, value: null } : failure(created);
    },

    async deleteContact(email) {
      const to = address(email);
      if (!to) return invalid("not an email address");
      const reply = await call({ method: "DELETE", path: `/contacts/${encodeURIComponent(to)}` });
      return reply.ok || reply.status === 404 ? { ok: true, value: null } : failure(reply);
    },
  };
}
