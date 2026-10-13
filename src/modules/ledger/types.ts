// Shapes of the ledger as the desk reads them. Everything here is a plain value: no client, no secret.
// Aksh's words (IdeaEvent.bodyMd) and his choices (IdeaEvent.stance) live on events; every machine number lives on
// IdeaScore. No type here puts the two in one object (spec s3 rule 1).

export type Expects = "outperform" | "underperform";
export type IdeaEventKind = "open" | "note" | "revise" | "upsize" | "downsize" | "close" | "review" | "void";
export type IdeaStatus = "open" | "closed" | "void";
export type CloseReason = "played_out" | "thesis_broken" | "horizon_reached" | "better_use" | "other";
export type ProcessCall = "sound" | "flawed";
export type MistakeTag = "thesis" | "valuation" | "timing" | "sizing" | "process" | "behaviour" | "luck" | "none";

/** Flags the scorer can raise (spec s6 and s18). Anything else the database sends is treated as "needs a check". */
export type ScoreFlag = "entry_pending" | "exit_pending" | "hand_price" | "jump" | "isin_changed" | "implausible" | "stale";

/** One idea: identity plus the state the events produced. Dates are ISO timestamps, not values Aksh typed. */
export type Idea = {
  id: string;
  companyId: string;
  companyName: string;
  symbol: string | null;
  /** The company file this idea sits with: a private convenience link, not sealed. */
  itemId: string | null;
  expects: Expects;
  horizonDays: number;
  held: boolean;
  status: IdeaStatus;
  openedAt: string;
  closedAt: string | null;
  closeReason: CloseReason | null;
  /** Aksh's own call on the process, from his latest "what I learned" entry. */
  processCall: ProcessCall | null;
  createdAt: string;
};

/** A sealed entry. `bodyMd` is his words; `stance` his choices. Neither ever holds a price or a return. */
export type IdeaEvent = {
  id: string;
  seq: number;
  ideaId: string;
  kind: IdeaEventKind;
  recordedAt: string;
  stance: Record<string, unknown>;
  bodyMd: string;
  hash: string;
  prevHash: string;
};

/** What the scorer (SQL `score_ideas()`) computed. Every field is a machine fact. Returns are fractions (0.12 = 12%). */
export type IdeaScore = {
  ideaId: string;
  entryDate: string | null;
  entryClose: number | null;
  entryIndex: number | null;
  entrySkippedDays: number | null;
  entrySource: string | null;
  markDate: string | null;
  markClose: number | null;
  markIndex: number | null;
  exitSkippedDays: number | null;
  markSource: string | null;
  factor: number | null;
  ideaReturn: number | null;
  indexReturn: number | null;
  /** Idea minus index (sign flipped for an idea that expects to do worse). */
  excess: number | null;
  holdingDays: number | null;
  isFinal: boolean;
  flags: ScoreFlag[];
  computedAt: string;
};

/** One restatement of a score, from the append-only `idea_score_changes` log. */
export type ScoreChange = {
  id: number;
  ideaId: string;
  changedAt: string;
  /** Names of the fields that changed. */
  changed: string[];
  was: Record<string, unknown>;
  became: Record<string, unknown>;
};

export type Summary = {
  /** Closed ideas whose exit is fixed, and how many of them ended ahead of the Nifty 50. */
  closed: { ahead: number; total: number; showPercent: boolean };
  /** Every idea with a figure (open ones and closed ones still waiting for their exit), marked to the latest close. */
  all: { ahead: number; total: number };
  medianExcessClosed: number | null;
  medianExcessAll: number | null;
  /** Calendar days from entry to exit, over the closed ideas counted in `closed`. */
  holdingDays: { median: number; min: number; max: number } | null;
  /** Idea ids, in the order given. */
  pastHorizon: string[];
  noLesson: string[];
  /** Flagged ideas (jump, ISIN change, implausible, or a flag we do not know): left out of every figure. */
  needsCheck: string[];
  /** No score yet, or the entry close is not in: left out of every figure. */
  waiting: string[];
  /** Closed, exit not fixed yet: counted in `all` only. */
  exitPending: string[];
  /** Counted, but the score rests on a close that is not the official file's. */
  handEntered: string[];
  /** Counted, but the latest close is three or more weekdays old. */
  stale: string[];
  /** Ideas whose score has been restated at least once (the log is `idea_score_changes`). */
  restated: string[];
  withdrawn: number;
};

export type GridCell = "earned" | "lucky" | "unlucky" | "deserved";

export type ChainSource = "chain" | "anchors";
export type AnchorReason = "early_event" | "gap" | "count" | "seq" | "head" | "line";

export type ChainProblem =
  | { source: "chain"; firstBadSeq: number | null; badIdea: string | null }
  | { source: "anchors"; firstBadDate: string | null; reason: AnchorReason | string | null };

/** The answer of both integrity checks. `ok` means the stored events and the sealed days agree with themselves. */
export type ChainStatus = {
  ok: boolean;
  events: number;
  sealedDays: number;
  /** Empty when ok. Names which check found each problem. */
  problems: ChainProblem[];
};

/** The raw rows of `check_ledger_chain()` and `check_ledger_anchors()`, one row each. */
export type ChainCheckRows = {
  chain: { ok: boolean; events: number; firstBadSeq: number | null; badIdea: string | null };
  anchors: { ok: boolean; days: number; firstBadDate: string | null; reason: string | null };
};

export type ClosesStatus = {
  /** Latest trading day with closes stored (official or not). */
  latestOpenDay: string | null;
  /** Latest trading day whose closes came from the official file. */
  latestOfficialDay: string | null;
  /** Trading days that rest on a hand-entered or dropped close only. */
  handEnteredDays: number;
};

export type AnchorStatus = {
  sealedDays: number;
  latestSealedDate: string | null;
  publishedDays: number;
  /** Sealed days not yet in the public file. */
  waitingDays: number;
  latestPublishedDate: string | null;
};

/** Nothing here reads or writes by itself: the Supabase implementation is in repo.ts, a fake is in tests. */
export interface LedgerRepo {
  openIdea(input: OpenIdeaCall): Promise<string>;
  addEvent(call: AddEventCall): Promise<string>;
  listIdeas(): Promise<Idea[]>;
  getIdea(id: string): Promise<Idea | null>;
  listEvents(ideaId: string): Promise<IdeaEvent[]>;
  /** Every "what I learned" entry, newest first. */
  listLessons(): Promise<IdeaEvent[]>;
  listScores(): Promise<IdeaScore[]>;
  /** The restatement log; all ideas when no id is given. */
  listScoreChanges(ideaId?: string): Promise<ScoreChange[]>;
  closesStatus(): Promise<ClosesStatus>;
  anchorStatus(): Promise<AnchorStatus>;
  /** Calls `check_ledger_chain()` and `check_ledger_anchors()`. */
  checkChain(): Promise<ChainCheckRows>;
  /** Recompute every score (`rescore_ideas()`), after a close or a corporate action was entered. */
  rescore(): Promise<number>;
  setItemLink(ideaId: string, itemId: string | null): Promise<void>;
}

export type OpenIdeaCall = {
  companyId: string;
  expects: Expects;
  horizonDays: number;
  held: boolean;
  bodyMd: string;
  itemId: string | null;
};

export type AddEventCall = {
  ideaId: string;
  kind: Exclude<IdeaEventKind, "open">;
  bodyMd: string;
  stance: Record<string, unknown>;
};
