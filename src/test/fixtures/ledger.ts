import type { Idea, IdeaEvent, IdeaScore, ScoreChange } from "@/modules/ledger/client";

// Builders for the Ledger screens' tests, a copy of the module's own test-fixtures (a component test may import a module through
// its client entry only). Every value is invented.

export function idea(over: Partial<Idea> & { id: string }): Idea {
  return {
    companyId: `company-${over.id}`,
    companyName: `Company ${over.id}`,
    symbol: `SYM${over.id.toUpperCase()}`,
    itemId: null,
    expects: "outperform",
    horizonDays: 365,
    held: false,
    status: "open",
    openedAt: "2026-01-05T05:00:00.000Z",
    closedAt: null,
    closeReason: null,
    processCall: null,
    createdAt: "2026-01-05T05:00:00.000Z",
    ...over,
  };
}

/** A closed idea with its exit fixed and a lesson written, unless overridden. */
export function closedIdea(over: Partial<Idea> & { id: string }): Idea {
  return idea({ status: "closed", closedAt: "2026-06-01T05:00:00.000Z", closeReason: "played_out", processCall: "sound", ...over });
}

export function score(over: Partial<IdeaScore> & { ideaId: string }): IdeaScore {
  return {
    entryDate: "2026-01-06",
    entryClose: 100,
    entryIndex: 20000,
    entrySkippedDays: 0,
    entrySource: "nse_fetch",
    markDate: "2026-06-02",
    markClose: 110,
    markIndex: 20500,
    exitSkippedDays: null,
    markSource: "nse_fetch",
    factor: 1,
    ideaReturn: 0.1,
    indexReturn: 0.025,
    excess: 0.075,
    holdingDays: 147,
    isFinal: false,
    flags: [],
    computedAt: "2026-10-13T00:30:00.000Z",
    ...over,
  };
}

/** A closed idea's final score. */
export function finalScore(over: Partial<IdeaScore> & { ideaId: string }): IdeaScore {
  return score({ isFinal: true, ...over });
}

export function change(over: Partial<ScoreChange> & { ideaId: string }): ScoreChange {
  return { id: 1, changedAt: "2026-10-10T00:30:00.000Z", changed: ["mark_close"], was: { mark_close: 100 }, became: { mark_close: 101 }, ...over };
}

export function event(over: Partial<IdeaEvent> & { id: string; ideaId: string; seq: number }): IdeaEvent {
  return {
    kind: "note",
    recordedAt: "2026-01-05T05:00:00.000Z",
    stance: {},
    bodyMd: "Words.",
    hash: "a".repeat(64),
    prevHash: "0".repeat(64),
    ...over,
  };
}
