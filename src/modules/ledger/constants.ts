import type { CloseReason, Expects, IdeaEventKind, MistakeTag, ProcessCall, ScoreFlag } from "./types";

// Values the browser may import. They mirror the SQL checks in migration 0010; a change here is a change there.

export const EXPECTS: readonly [Expects, ...Expects[]] = ["outperform", "underperform"];
export const EVENT_KINDS: readonly IdeaEventKind[] = ["open", "note", "revise", "upsize", "downsize", "close", "review", "void"];
/** Every kind except `open`, which only openIdea() writes. */
export const ADD_EVENT_KINDS = ["note", "revise", "upsize", "downsize", "close", "review", "void"] as const;
export const CLOSE_REASONS: readonly [CloseReason, ...CloseReason[]] = ["played_out", "thesis_broken", "horizon_reached", "better_use", "other"];
export const PROCESS_CALLS: readonly [ProcessCall, ...ProcessCall[]] = ["sound", "flawed"];
export const MISTAKE_TAGS: readonly [MistakeTag, ...MistakeTag[]] = ["thesis", "valuation", "timing", "sizing", "process", "behaviour", "luck", "none"];

export const BODY_MAX = 10_000;
export const HORIZON_MIN_DAYS = 30;
export const HORIZON_MAX_DAYS = 3650;

/** The three horizons the form offers by name; any number of days from 30 to 3650 is also allowed. */
export const HORIZON_CHOICES = [
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "3 years", days: 1095 },
] as const;

/** What a corporate action can be (spec s5.4). `none` is "I looked at this move; no action explains it" and has factor exactly 1. */
export const ACTION_KINDS = ["split", "bonus", "other", "none"] as const;
export const FACTOR_MIN = 0.001;
export const FACTOR_MAX = 1000;
export const ACTION_NOTE_MAX = 500;
/** An ex-date may be entered up to this many days ahead (a split announced for next month); never earlier than the first date below. */
export const ACTION_AHEAD_DAYS = 366;
export const ACTION_FIRST_DATE = "2000-01-01";
/** A close (typed or dropped) may be stored for a day at most this many days back, and the Closes page lists the closes that are not NSE's own fetched file over the same span (upload review M-3). */
export const CLOSE_LOOKBACK_DAYS = 400;

/** A percentage of closed ideas is not shown below this many (decision D13). */
export const MIN_CLOSED_FOR_PERCENT = 5;

/** Flags that need no action from Aksh. Any other flag, including one this build has not heard of, means "needs a check". */
export const BENIGN_FLAGS: readonly ScoreFlag[] = ["entry_pending", "exit_pending", "hand_price", "attested", "stale"];
