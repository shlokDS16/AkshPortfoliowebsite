import { InvalidInputError } from "@/lib/errors";
import { SECTORS, type Sector } from "@/lib/sectors";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { NameOnPublicItemError } from "./errors";

export { SECTORS, type Sector };

export type NameToScreen = {
  id: string; token: string; type: "company" | "theme"; firstSeen: string; quote: string | null; suggestion: { id: string; label: string } | null;
};
export type NameDecision = { kind: "new"; name: string; sector: Sector | null } | { kind: "merge"; intoId: string } | { kind: "plain" };
export type NameStub = { type: "company" | "theme"; id: string; key: string | null };
export type NameOp =
  | { op: "insert"; table: "company_aliases" | "ignored_tokens"; row: Record<string, string> }
  | {
      op: "update";
      table: "companies" | "themes" | "items" | "captures";
      set: Record<string, string | boolean | null>;
      match: Record<string, string>;
      privateOnly?: boolean;
    };

type Candidate = { id: string; symbol: string | null; name: string };

/** A screener-style guess: the token's first four letters match a screened symbol or company name. */
export function suggestMatch(token: string, candidates: Candidate[]): { id: string; label: string } | null {
  const key = token.replace(/^[$#]/, "").toLowerCase().slice(0, 4);
  if (key.length < 3) return null;
  const hit = candidates.find((c) => (c.symbol ?? "").toLowerCase().startsWith(key) || c.name.toLowerCase().startsWith(key));
  return hit ? { id: hit.id, label: hit.name } : null;
}

/**
 * The writes a decision makes, in order; each is idempotent, so a half-finished decision can be made again.
 * Public items never change here, and a decided stub is archived, not renamed: the 0004 catalog guard freezes a
 * linked row's name/slug/symbol, while archived_at is free (A1.4).
 */
export function planDecision(stub: NameStub, d: NameDecision, now: string): NameOp[] {
  const table = stub.type === "company" ? "companies" : "themes";
  const column = stub.type === "company" ? "company_id" : "theme_id";
  if (d.kind === "new") {
    return [{ op: "update", table, set: { name: d.name, ...(stub.type === "company" ? { sector: d.sector } : {}), needs_review: false }, match: { id: stub.id } }];
  }
  if (d.kind === "merge" && stub.type !== "company") throw new InvalidInputError();
  const record: NameOp[] =
    stub.key === null
      ? []
      : d.kind === "merge"
        ? [{ op: "insert", table: "company_aliases", row: { symbol: stub.key, company_id: d.intoId } }]
        : [{ op: "insert", table: "ignored_tokens", row: { kind: stub.type === "company" ? "symbol" : "theme", token: stub.key } }];
  const target = d.kind === "merge" ? d.intoId : null;
  return [
    ...record,
    { op: "update", table: "items", set: { [column]: target }, match: { [column]: stub.id }, privateOnly: true },
    { op: "update", table: "captures", set: { [column]: target }, match: { [column]: stub.id } },
    { op: "update", table, set: { needs_review: false, archived_at: now }, match: { id: stub.id } },
  ];
}

/** The catalog guard raises 23514 when a public item links the row; that is a rule, not a failure. */
function writeError(op: string, error: { message: string; code?: string }): Error {
  return error.code === "23514" ? new NameOnPublicItemError() : dbError(op, error);
}

/** Only an unscreened, live stub can be decided. */
async function loadStub(db: Db, type: "company" | "theme", id: string): Promise<NameStub> {
  const { data, error } =
    type === "company"
      ? await db.from("companies").select("key:nse_symbol, needs_review, archived_at").eq("id", id).maybeSingle()
      : await db.from("themes").select("key:slug, needs_review, archived_at").eq("id", id).maybeSingle();
  if (error) throw dbError("catalog.loadStub", error);
  if (!data || !data.needs_review || data.archived_at) throw new InvalidInputError();
  return { type, id, key: data.key };
}

export async function decideName(db: Db, type: "company" | "theme", id: string, decision: NameDecision, now = new Date()): Promise<void> {
  const stub = await loadStub(db, type, id);
  if (decision.kind !== "new") {
    const column = type === "company" ? "company_id" : "theme_id";
    const linked = await db.from("items").select("id", { count: "exact", head: true }).eq(column, id).eq("visibility", "public");
    if (linked.error) throw dbError("catalog.decideName.publicCheck", linked.error);
    if ((linked.count ?? 0) > 0) throw new NameOnPublicItemError();
  }
  if (decision.kind === "merge") {
    const target = await db.from("companies").select("id").eq("id", decision.intoId).eq("needs_review", false).is("archived_at", null).neq("id", id).maybeSingle();
    if (target.error) throw dbError("catalog.decideName.target", target.error);
    if (!target.data) throw new InvalidInputError();
  }
  if (decision.kind === "merge" && stub.key !== null) {
    // An alias is never re-pointed (no update or delete policy): a symbol already aliased elsewhere is a conflict.
    const alias = await db.from("company_aliases").select("company_id").eq("symbol", stub.key).maybeSingle();
    if (alias.error) throw dbError("catalog.decideName.alias", alias.error);
    if (alias.data && alias.data.company_id !== decision.intoId) throw new InvalidInputError();
  }
  for (const op of planDecision(stub, decision, now.toISOString())) {
    if (op.op === "insert") {
      const { error } = await db.from(op.table).upsert(op.row as never, { onConflict: op.table === "company_aliases" ? "symbol" : "kind,token", ignoreDuplicates: true });
      if (error) throw writeError(`catalog.decideName.${op.table}`, error);
      continue;
    }
    // privateOnly ops are always on items: a public item changes only through publish_revision().
    const set = op.set as never;
    const { error } = await (op.privateOnly
      ? db.from("items").update(set).match(op.match).neq("visibility", "public")
      : db.from(op.table).update(set).match(op.match));
    if (error) throw writeError(`catalog.decideName.${op.table}`, error);
  }
}

/** How many stubs one screen shows, oldest first; the rest are counted by the caller (countNamesToReview). */
export const NAMES_PAGE_SIZE = 50;
const CANDIDATE_LIMIT = 500;

/** The earliest capture that named this stub: ordered by time then id, one row. */
async function firstQuote(db: Db, column: "company_id" | "theme_id", id: string): Promise<string | null> {
  const { data, error } = await db
    .from("captures")
    .select("raw_text")
    .eq(column, id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("catalog.firstQuote", error);
  return data?.raw_text ?? null;
}

export async function listNamesToScreen(db: Db): Promise<NameToScreen[]> {
  const [stubs, themes, screened] = await Promise.all([
    db.from("companies").select("id, nse_symbol, name, created_at").eq("needs_review", true).is("archived_at", null).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(NAMES_PAGE_SIZE),
    db.from("themes").select("id, slug, name, created_at").eq("needs_review", true).is("archived_at", null).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(NAMES_PAGE_SIZE),
    db.from("companies").select("id, nse_symbol, name").eq("needs_review", false).is("archived_at", null).order("name", { ascending: true }).limit(CANDIDATE_LIMIT),
  ]);
  for (const r of [stubs, themes, screened]) if (r.error) throw dbError("catalog.listNamesToScreen", r.error);
  const candidates = (screened.data ?? []).map((c) => ({ id: c.id, symbol: c.nse_symbol, name: c.name }));
  type Stub = Omit<NameToScreen, "quote">;
  const all: Stub[] = [
    ...(stubs.data ?? []).map((c): Stub => {
      const token = `$${c.nse_symbol ?? c.name}`;
      return { id: c.id, token, type: "company", firstSeen: c.created_at, suggestion: suggestMatch(token, candidates) };
    }),
    ...(themes.data ?? []).map((t): Stub => ({ id: t.id, token: `#${t.slug}`, type: "theme", firstSeen: t.created_at, suggestion: null })),
  ];
  // The oldest NAMES_PAGE_SIZE across both kinds: one first-capture read each, so the work is bounded.
  const page = all.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.id.localeCompare(b.id)).slice(0, NAMES_PAGE_SIZE);
  return Promise.all(page.map(async (n): Promise<NameToScreen> => ({ ...n, quote: await firstQuote(db, n.type === "company" ? "company_id" : "theme_id", n.id) })));
}
