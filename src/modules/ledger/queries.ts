import type { Db } from "@/lib/supabase/types";
import { addDays, istDate } from "@/lib/dates";
import { chainReport, type ChainReport } from "./chain";
import { buildClosesView, DAYS_SHOWN, RECENT_DAYS, type ClosesView } from "./closes";
import { voidDeadline } from "./figures";
import { lessonLines, type LessonLine } from "./journal-list";
import { eventLine, ideaLine, needsYou, type EventLine, type IdeaLine, type NeedsYou } from "./lines";
import { createSupabaseLedgerRepo } from "./repo";
import { checkLedger, loadIdea, loadLedger } from "./service";
import type { AnchorStatus, ChainStatus, ClosesStatus, Idea, IdeaScore, LedgerRepo, PickCompany, Summary } from "./types";

// What the three Ledger pages read: view models only, built from the module's own service. Server side.

/** The integrity check either ran (and passed or failed) or could not run. "Could not run" is never shown as a pass. */
export type ChainState = { kind: "checked"; status: ChainStatus; report: ChainReport } | { kind: "unreadable" };

export type LedgerHome = {
  today: string;
  summary: Summary;
  open: IdeaLine[];
  closed: IdeaLine[];
  needs: NeedsYou[];
  /** Null when the status could not be read: the line then says so instead of staying silent. */
  closes: ClosesStatus | null;
  anchors: AnchorStatus | null;
  chain: ChainState;
};

/** Names an operation only: a database message can carry row data. */
async function soft<T>(op: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`ledger page: could not read ${op}`, error instanceof Error ? error.name : typeof error);
    return null;
  }
}

export async function buildLedgerHome(repo: LedgerRepo, today: string): Promise<LedgerHome> {
  const [view, closes, anchors, chain] = await Promise.all([
    loadLedger(repo, today),
    soft("closes", () => repo.closesStatus()),
    soft("anchors", () => repo.anchorStatus()),
    soft("integrity check", () => checkLedger(repo)),
  ]);
  const scoreById = new Map(view.scores.map((s) => [s.ideaId, s] as const));
  const past = new Set(view.summary.pastHorizon);
  const lines = view.ideas.map((idea) => ideaLine(idea, scoreById.get(idea.id) ?? null, view.changes, past.has(idea.id)));
  return {
    today,
    summary: view.summary,
    open: lines.filter((l) => l.status === "open"),
    closed: lines.filter((l) => l.status === "closed"),
    needs: needsYou(view.ideas, view.scores, view.summary),
    closes,
    anchors,
    chain: chain ? { kind: "checked", status: chain, report: chainReport(chain) } : { kind: "unreadable" },
  };
}

export const getLedgerHome = (db: Db, today: string): Promise<LedgerHome> => buildLedgerHome(createSupabaseLedgerRepo(db), today);

/** The entries an idea can take next, by its state. Withdrawing is offered only inside its window. */
export const ADD_KINDS_OPEN = ["note", "revise", "upsize", "downsize", "close"] as const;
export type AddKind = (typeof ADD_KINDS_OPEN)[number] | "void" | "review";

export type IdeaPage = {
  idea: Idea;
  line: IdeaLine;
  score: IdeaScore | null;
  events: EventLine[];
  /** The first entry's time: when the idea was sealed. */
  sealedAt: string | null;
  allowed: AddKind[];
  /** When withdrawing stops being possible, while it is possible. */
  voidUntil: string | null;
};

export async function buildIdeaPage(repo: LedgerRepo, id: string, now: Date): Promise<IdeaPage | null> {
  const detail = await loadIdea(repo, id);
  if (!detail) return null;
  const { idea, events, score, changes } = detail;
  const today = istDate(now);
  const base = ideaLine(idea, score, changes, false);
  const line = { ...base, pastHorizon: idea.status === "open" && base.horizonEnds < today };
  const sealedAt = events[0]?.recordedAt ?? null;
  const deadline = sealedAt ? voidDeadline(sealedAt) : null;
  const canVoid = idea.status === "open" && deadline !== null && now.getTime() <= deadline.getTime();
  const allowed: AddKind[] = idea.status === "open" ? [...ADD_KINDS_OPEN, ...(canVoid ? (["void"] as const) : [])] : idea.status === "closed" ? ["review"] : [];
  return { idea, line, score, events: events.map(eventLine), sealedAt, allowed, voidUntil: canVoid && deadline ? deadline.toISOString() : null };
}

export const getIdeaPage = (db: Db, id: string, now: Date = new Date()): Promise<IdeaPage | null> => buildIdeaPage(createSupabaseLedgerRepo(db), id, now);

/** The Closes page: the recent days, the typed and dropped closes, the corporate actions and the lately restated scores. A failed read throws (never an empty page). */
export type ClosesPage = ClosesView & { status: ClosesStatus | null };

export async function buildClosesPage(repo: LedgerRepo, today: string): Promise<ClosesPage> {
  const [days, closes, ideas, scores, actions, changes, companies, status] = await Promise.all([
    repo.listMarketDays(addDays(today, -(DAYS_SHOWN + 5))),
    repo.listCloses(addDays(today, -RECENT_DAYS)),
    repo.listIdeas(),
    repo.listScores(),
    repo.listActions(),
    repo.listScoreChanges(),
    repo.listPickable(),
    soft("closes", () => repo.closesStatus()),
  ]);
  return { ...buildClosesView({ today, days, closes, ideas, scores, actions, changes, companies }), status };
}

export const getClosesPage = (db: Db, today: string): Promise<ClosesPage> => buildClosesPage(createSupabaseLedgerRepo(db), today);

/** The Journal: every lesson he wrote, newest first, with its idea. Paging is the page's (a window over this list). */
export async function buildJournal(repo: LedgerRepo): Promise<LessonLine[]> {
  const [lessons, ideas] = await Promise.all([repo.listLessons(), repo.listIdeas()]);
  return lessonLines(lessons, ideas);
}

export const getJournal = (db: Db): Promise<LessonLine[]> => buildJournal(createSupabaseLedgerRepo(db));

/** The company a file belongs to (null when there is no such file): the New idea page fixes the company to it. */
export const getItemCompany = (db: Db, itemId: string): Promise<string | null> => createSupabaseLedgerRepo(db).itemCompany(itemId);

export const listPickCompanies = (db: Db): Promise<PickCompany[]> => createSupabaseLedgerRepo(db).listPickable();
