import type { Json, Tables } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { asRecord } from "@/lib/records";
import { ledgerErrorFromDb } from "./errors";
import type {
  AnchorStatus, ChainCheckRows, ClosesStatus, CloseReason, Expects, Idea, IdeaEvent, IdeaEventKind, IdeaScore, IdeaStatus, LedgerRepo,
  ProcessCall, ScoreChange, ScoreFlag,
} from "./types";

// Reads use the admin's cookie client (RLS, admin only). Named columns only: a '*' would also pull the sealed text and the
// nonce of every event, which no screen needs. The only writes are the two event doors, the rescore and the item link.
const IDEA_COLUMNS = "id, company_id, item_id, expects, horizon_days, held, status, opened_at, closed_at, close_reason, process_call, created_at";
const EVENT_COLUMNS = "id, seq, idea_id, kind, recorded_at, stance, body_md, hash, prev_hash";
const SCORE_COLUMNS =
  "idea_id, entry_date, entry_close, entry_index, entry_skipped_days, entry_source, mark_date, mark_close, mark_index, exit_skipped_days, mark_source, factor, idea_return, index_return, excess, holding_days, is_final, flags, computed_at";
const CHANGE_COLUMNS = "id, idea_id, changed_at, changed, was, became";

type IdeaRow = Pick<Tables<"ideas">, "id" | "company_id" | "item_id" | "expects" | "horizon_days" | "held" | "status" | "opened_at" | "closed_at" | "close_reason" | "process_call" | "created_at">;
type CompanyRow = { id: string; name: string; nse_symbol: string | null };

function toIdea(row: IdeaRow, company: CompanyRow | undefined): Idea {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: company?.name ?? "Unnamed company",
    symbol: company?.nse_symbol ?? null,
    itemId: row.item_id,
    expects: row.expects as Expects,
    horizonDays: row.horizon_days,
    held: row.held,
    status: row.status as IdeaStatus,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closeReason: row.close_reason as CloseReason | null,
    processCall: row.process_call as ProcessCall | null,
    createdAt: row.created_at,
  };
}

function toEvent(row: Pick<Tables<"idea_events">, "id" | "seq" | "idea_id" | "kind" | "recorded_at" | "stance" | "body_md" | "hash" | "prev_hash">): IdeaEvent {
  return {
    id: row.id,
    seq: Number(row.seq),
    ideaId: row.idea_id,
    kind: row.kind as IdeaEventKind,
    recordedAt: row.recorded_at,
    stance: asRecord(row.stance) ?? {},
    bodyMd: row.body_md,
    hash: row.hash,
    prevHash: row.prev_hash,
  };
}

function toScore(row: Tables<"idea_scores">): IdeaScore {
  return {
    ideaId: row.idea_id,
    entryDate: row.entry_date,
    entryClose: row.entry_close,
    entryIndex: row.entry_index,
    entrySkippedDays: row.entry_skipped_days,
    entrySource: row.entry_source,
    markDate: row.mark_date,
    markClose: row.mark_close,
    markIndex: row.mark_index,
    exitSkippedDays: row.exit_skipped_days,
    markSource: row.mark_source,
    factor: row.factor,
    ideaReturn: row.idea_return,
    indexReturn: row.index_return,
    excess: row.excess,
    holdingDays: row.holding_days,
    isFinal: row.is_final,
    flags: row.flags as ScoreFlag[],
    computedAt: row.computed_at,
  };
}

function toChange(row: Tables<"idea_score_changes">): ScoreChange {
  return {
    id: Number(row.id),
    ideaId: row.idea_id,
    changedAt: row.changed_at,
    changed: row.changed,
    was: asRecord(row.was) ?? {},
    became: asRecord(row.became) ?? {},
  };
}

// PostgREST cuts a response at its max rows (supabase/config.toml: 1000) without saying so, so the lists that grow with the
// ledger are read a page at a time until a page comes back short. Each needs a total order that is unique per row.
const PAGE_ROWS = 1_000;
const COMPANY_GROUP = 100;

async function readAll<R>(op: string, page: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string; code?: string } | null }>): Promise<R[]> {
  const out: R[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const rows = check(op, await page(from, from + PAGE_ROWS - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
  }
}

function check<T>(op: string, result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw ledgerErrorFromDb(op, result.error);
  return result.data;
}

export function createSupabaseLedgerRepo(db: Db): LedgerRepo {
  // The company names are read in small groups: an `in (...)` of every id would make the request address too long.
  async function withCompanies(rows: IdeaRow[]): Promise<Idea[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.company_id))];
    const byId = new Map<string, CompanyRow>();
    for (let at = 0; at < ids.length; at += COMPANY_GROUP) {
      const group = ids.slice(at, at + COMPANY_GROUP);
      const companies = check("ledger.companies", await db.from("companies").select("id, name, nse_symbol").in("id", group)) as CompanyRow[] | null;
      for (const c of companies ?? []) byId.set(c.id, c);
    }
    return rows.map((r) => toIdea(r, byId.get(r.company_id)));
  }

  return {
    async openIdea(input) {
      const args = {
        p_company_id: input.companyId,
        p_expects: input.expects,
        p_horizon_days: input.horizonDays,
        p_held: input.held,
        p_body_md: input.bodyMd,
        ...(input.itemId === null ? {} : { p_item_id: input.itemId }),
      };
      const id = check("ledger.openIdea", await db.rpc("open_idea", args));
      if (typeof id !== "string") throw dbError("ledger.openIdea", { message: "no id returned" });
      return id;
    },

    async addEvent(call) {
      const id = check(
        "ledger.addEvent",
        await db.rpc("add_idea_event", { p_idea_id: call.ideaId, p_kind: call.kind, p_body_md: call.bodyMd, p_stance: call.stance as Json }),
      );
      if (typeof id !== "string") throw dbError("ledger.addEvent", { message: "no id returned" });
      return id;
    },

    async listIdeas() {
      const rows = await readAll("ledger.listIdeas", (from, to) =>
        db.from("ideas").select(IDEA_COLUMNS).order("opened_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
      );
      return withCompanies(rows as IdeaRow[]);
    },

    async getIdea(id) {
      const row = check("ledger.getIdea", await db.from("ideas").select(IDEA_COLUMNS).eq("id", id).maybeSingle()) as IdeaRow | null;
      if (!row) return null;
      return (await withCompanies([row]))[0] ?? null;
    },

    async listEvents(ideaId) {
      const rows = await readAll("ledger.listEvents", (from, to) =>
        db.from("idea_events").select(EVENT_COLUMNS).eq("idea_id", ideaId).order("seq", { ascending: true }).range(from, to),
      );
      return rows.map(toEvent);
    },

    async listLessons() {
      const rows = await readAll("ledger.listLessons", (from, to) =>
        db.from("idea_events").select(EVENT_COLUMNS).eq("kind", "review").order("seq", { ascending: false }).range(from, to),
      );
      return rows.map(toEvent);
    },

    async listScores() {
      const rows = await readAll("ledger.listScores", (from, to) => db.from("idea_scores").select(SCORE_COLUMNS).order("idea_id").range(from, to));
      return rows.map(toScore);
    },

    async listScoreChanges(ideaId) {
      const rows = await readAll("ledger.listScoreChanges", (from, to) => {
        const base = db.from("idea_score_changes").select(CHANGE_COLUMNS);
        return (ideaId === undefined ? base : base.eq("idea_id", ideaId)).order("id", { ascending: false }).range(from, to);
      });
      return rows.map(toChange);
    },

    async listPickable() {
      const rows = await readAll("ledger.listPickable", (from, to) =>
        db.from("companies").select("id, name, nse_symbol, needs_review").is("archived_at", null).order("name").order("id").range(from, to),
      );
      return rows.map((c) => ({ id: c.id, name: c.name, symbol: c.nse_symbol, needsReview: c.needs_review }));
    },

    async closesStatus(): Promise<ClosesStatus> {
      const latest = (source?: string) => {
        const q = db.from("market_days").select("trade_date").eq("status", "open");
        return (source ? q.eq("source", source) : q).order("trade_date", { ascending: false }).limit(1);
      };
      const [open, official, hand] = await Promise.all([
        latest(),
        latest("nse_fetch"),
        db.from("market_days").select("trade_date", { count: "exact", head: true }).eq("status", "open").neq("source", "nse_fetch"),
      ]);
      if (hand.error) throw ledgerErrorFromDb("ledger.closesStatus", hand.error);
      return {
        latestOpenDay: check("ledger.closesStatus", open)?.[0]?.trade_date ?? null,
        latestOfficialDay: check("ledger.closesStatus", official)?.[0]?.trade_date ?? null,
        handEnteredDays: hand.count ?? 0,
      };
    },

    async anchorStatus(): Promise<AnchorStatus> {
      const [sealed, published, lastSealed, lastPublished] = await Promise.all([
        db.from("ledger_anchors").select("anchor_date", { count: "exact", head: true }),
        db.from("ledger_anchors").select("anchor_date", { count: "exact", head: true }).not("published_at", "is", null),
        db.from("ledger_anchors").select("anchor_date").order("anchor_date", { ascending: false }).limit(1),
        db.from("ledger_anchors").select("anchor_date").not("published_at", "is", null).order("anchor_date", { ascending: false }).limit(1),
      ]);
      for (const r of [sealed, published]) if (r.error) throw ledgerErrorFromDb("ledger.anchorStatus", r.error);
      const sealedDays = sealed.count ?? 0;
      const publishedDays = published.count ?? 0;
      return {
        sealedDays,
        publishedDays,
        waitingDays: Math.max(0, sealedDays - publishedDays),
        latestSealedDate: check("ledger.anchorStatus", lastSealed)?.[0]?.anchor_date ?? null,
        latestPublishedDate: check("ledger.anchorStatus", lastPublished)?.[0]?.anchor_date ?? null,
      };
    },

    async checkChain(): Promise<ChainCheckRows> {
      const [chainResult, anchorResult] = await Promise.all([db.rpc("check_ledger_chain"), db.rpc("check_ledger_anchors")]);
      const chain = check("ledger.checkChain", chainResult)?.[0];
      const anchors = check("ledger.checkAnchors", anchorResult)?.[0];
      // Fail closed: no row is an error, and an `ok` that is not exactly true is not ok.
      if (!chain) throw dbError("ledger.checkChain", { message: "no result" });
      if (!anchors) throw dbError("ledger.checkAnchors", { message: "no result" });
      return {
        chain: { ok: chain.ok === true, events: Number(chain.events ?? 0), firstBadSeq: chain.first_bad_seq == null ? null : Number(chain.first_bad_seq), badIdea: chain.bad_idea ?? null },
        anchors: { ok: anchors.ok === true, days: Number(anchors.days ?? 0), firstBadDate: anchors.first_bad_date ?? null, reason: anchors.reason ?? null },
      };
    },

    async rescore() {
      const n = check("ledger.rescore", await db.rpc("rescore_ideas"));
      return typeof n === "number" ? n : 0;
    },

    async setItemLink(ideaId, itemId) {
      check("ledger.setItemLink", await db.from("ideas").update({ item_id: itemId }).eq("id", ideaId));
    },
  };
}
