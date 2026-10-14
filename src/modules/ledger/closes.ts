import { addDays, istDate } from "@/lib/dates";
import { formatClose } from "./figures";
import { restatements, type Restated } from "./marks";
import { ACTION_KIND_TEXT, actionFactorText, DAY_STATE_TEXT } from "@/lib/messages-closes";
import { LEDGER_SOURCE_TEXT } from "@/lib/messages-ledger";
import type { ActionKind, CorporateAction, Idea, IdeaScore, MarketDay, PickCompany, ScoreChange, StoredClose } from "./types";

// The Closes page's view model (Task 11): the recent days with their state, the closes that are not NSE's own fetched file, the
// corporate actions by company, and the scores restated lately. Pure: rows in, plain values out. Nothing here is his text.

/** How many calendar days back the days list reaches (today included). */
export const DAYS_SHOWN = 10;
/** How far back the typed and dropped closes and the restatements are listed. */
export const RECENT_DAYS = 30;
const HAND_LIMIT = 50;
const RESTATED_LIMIT = 10;

export type DayState = "open" | "shut" | "undecided" | "today";
export type DayLine = {
  date: string;
  state: DayState;
  stateText: string;
  /** Where an open day's closes came from, in words. */
  sourceText: string | null;
  /** Names of tracked companies with no close for this open day. */
  missing: string[];
};
export type HandCloseLine = { companyName: string; symbol: string | null; date: string; close: string; sourceText: string };
export type ActionLine = {
  id: string;
  exDate: string;
  kind: ActionKind;
  kindText: string;
  factor: number;
  factorText: string;
  note: string | null;
  live: boolean;
  /** The id this entry replaces, when it is a correction. */
  corrects: string | null;
  enteredOn: string;
};
export type ActionGroup = { companyId: string; name: string; symbol: string | null; live: ActionLine[]; replaced: ActionLine[] };
export type RestatedLine = { ideaId: string; name: string; restated: Restated };

export type ClosesView = {
  today: string;
  days: DayLine[];
  hand: HandCloseLine[];
  actions: ActionGroup[];
  restated: RestatedLine[];
  /** Companies a close or an action can be entered for. */
  companies: PickCompany[];
};

const isWeekend = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

const sourceText = (source: string): string =>
  Object.hasOwn(LEDGER_SOURCE_TEXT, source) ? LEDGER_SOURCE_TEXT[source as keyof typeof LEDGER_SOURCE_TEXT] : "source not recorded";

/** The companies the desk still needs official closes for: an open idea, or a closed one whose score is not yet final on fetched closes. */
export function trackedIdeas(ideas: readonly Idea[], scores: readonly IdeaScore[]): Idea[] {
  const byIdea = new Map(scores.map((s) => [s.ideaId, s] as const));
  return ideas.filter((i) => {
    if (i.status === "open") return true;
    if (i.status !== "closed") return false;
    const s = byIdea.get(i.id);
    return !(s && s.isFinal && s.entrySource === "nse_fetch" && s.markSource === "nse_fetch");
  });
}

function daysList(today: string, days: readonly MarketDay[], closes: readonly StoredClose[], ideas: readonly Idea[], scores: readonly IdeaScore[]): DayLine[] {
  const known = new Map(days.map((d) => [d.tradeDate, d] as const));
  const have = new Set(closes.map((c) => `${c.companyId}|${c.tradeDate}`));
  const tracked = trackedIdeas(ideas, scores);
  const out: DayLine[] = [];
  for (let i = 0; i < DAYS_SHOWN; i++) {
    const date = addDays(today, -i);
    const row = known.get(date);
    if (!row && isWeekend(date)) continue;
    if (row?.status === "shut") {
      out.push({ date, state: "shut", stateText: DAY_STATE_TEXT.shut, sourceText: null, missing: [] });
    } else if (row) {
      // Each tracked company once, by name, when an idea on it was already open that day and its close is not stored.
      const names = new Map<string, string>();
      for (const idea of tracked) {
        if (istDate(new Date(idea.openedAt)) > date || have.has(`${idea.companyId}|${date}`)) continue;
        names.set(idea.companyId, idea.companyName);
      }
      out.push({ date, state: "open", stateText: DAY_STATE_TEXT.open, sourceText: sourceText(row.source), missing: [...names.values()].sort() });
    } else if (date === today) {
      out.push({ date, state: "today", stateText: DAY_STATE_TEXT.today, sourceText: null, missing: [] });
    } else {
      out.push({ date, state: "undecided", stateText: DAY_STATE_TEXT.undecided, sourceText: null, missing: [] });
    }
  }
  return out;
}

function groupActions(actions: readonly CorporateAction[], companies: readonly PickCompany[], ideas: readonly Idea[]): ActionGroup[] {
  const replacedBy = new Set(actions.flatMap((a) => (a.supersedes ? [a.supersedes] : [])));
  const names = new Map<string, { name: string; symbol: string | null }>();
  for (const i of ideas) names.set(i.companyId, { name: i.companyName, symbol: i.symbol });
  for (const c of companies) names.set(c.id, { name: c.name, symbol: c.symbol });
  const groups = new Map<string, ActionGroup>();
  for (const a of actions) {
    const who = names.get(a.companyId) ?? { name: "Unnamed company", symbol: null };
    const group = groups.get(a.companyId) ?? { companyId: a.companyId, name: who.name, symbol: who.symbol, live: [], replaced: [] };
    const live = !replacedBy.has(a.id);
    const line: ActionLine = {
      id: a.id, exDate: a.exDate, kind: a.kind, kindText: ACTION_KIND_TEXT[a.kind] ?? "Other", factor: a.factor, factorText: actionFactorText(a.kind, a.factor),
      note: a.note, live, corrects: a.supersedes, enteredOn: istDate(new Date(a.createdAt)),
    };
    (live ? group.live : group.replaced).push(line);
    groups.set(a.companyId, group);
  }
  const newest = (a: ActionLine, b: ActionLine) => b.exDate.localeCompare(a.exDate) || b.enteredOn.localeCompare(a.enteredOn);
  return [...groups.values()]
    .map((g) => ({ ...g, live: g.live.sort(newest), replaced: g.replaced.sort(newest) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ClosesInput = {
  today: string;
  days: readonly MarketDay[];
  closes: readonly StoredClose[];
  ideas: readonly Idea[];
  scores: readonly IdeaScore[];
  actions: readonly CorporateAction[];
  changes: readonly ScoreChange[];
  companies: readonly PickCompany[];
};

export function buildClosesView(input: ClosesInput): ClosesView {
  const { today, ideas } = input;
  const since = addDays(today, -RECENT_DAYS);
  const company = new Map<string, { name: string; symbol: string | null }>();
  for (const i of ideas) company.set(i.companyId, { name: i.companyName, symbol: i.symbol });
  for (const c of input.companies) company.set(c.id, { name: c.name, symbol: c.symbol });
  const hand = input.closes
    .filter((c) => c.source !== "nse_fetch" && c.tradeDate >= since)
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || a.companyId.localeCompare(b.companyId))
    .slice(0, HAND_LIMIT)
    .map((c): HandCloseLine => {
      const who = company.get(c.companyId);
      return { companyName: who?.name ?? "Unnamed company", symbol: who?.symbol ?? null, date: c.tradeDate, close: formatClose(c.close), sourceText: sourceText(c.source) };
    });
  const names = new Map(ideas.map((i) => [i.id, i.companyName] as const));
  const restated = input.changes
    .filter((c) => istDate(new Date(c.changedAt)) >= since && names.has(c.ideaId))
    .slice(0, RESTATED_LIMIT)
    .flatMap((c) => restatements([c]).map((restated): RestatedLine => ({ ideaId: c.ideaId, name: names.get(c.ideaId) as string, restated })));
  return {
    today,
    days: daysList(today, input.days, input.closes, ideas, input.scores),
    hand,
    actions: groupActions(input.actions, input.companies, ideas),
    restated,
    // A close is kept, and a score rests on an action, only for a company with an idea on file (a withdrawn idea does not count).
    companies: input.companies.filter((c) => !c.needsReview && c.symbol && ideas.some((i) => i.companyId === c.id && i.status !== "void")),
  };
}
