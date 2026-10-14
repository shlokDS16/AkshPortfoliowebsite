import type {
  AddEventCall, AnchorStatus, ChainCheckRows, ClosesStatus, Idea, IdeaEvent, IdeaScore, LedgerRepo, OpenIdeaCall, PickCompany, ScoreChange,
} from "./types";

export type FakeSeed = {
  ideas?: Idea[];
  events?: IdeaEvent[];
  scores?: IdeaScore[];
  changes?: ScoreChange[];
  chain?: ChainCheckRows["chain"];
  anchors?: ChainCheckRows["anchors"];
  companies?: PickCompany[];
  /** Which company each file belongs to, by item id. */
  itemCompanies?: Record<string, string>;
  closes?: ClosesStatus;
  anchorStatus?: AnchorStatus;
  /** Every call that reaches the database throws this. */
  failWith?: Error;
};

export type FakeCall = { method: string; args: unknown[] };

/** An in-memory LedgerRepo for tests. `calls` records each method that was reached, so a test can prove none was. */
export function createFakeLedgerRepo(seed: FakeSeed = {}): LedgerRepo & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const run = async <T>(method: string, args: unknown[], value: () => T): Promise<T> => {
    calls.push({ method, args });
    if (seed.failWith) throw seed.failWith;
    return value();
  };
  const ideas = seed.ideas ?? [];
  return {
    calls,
    openIdea: (input: OpenIdeaCall) => run("openIdea", [input], () => "idea-new"),
    addEvent: (call: AddEventCall) => run("addEvent", [call], () => "event-new"),
    listIdeas: () => run("listIdeas", [], () => ideas),
    getIdea: (id) => run("getIdea", [id], () => ideas.find((i) => i.id === id) ?? null),
    listEvents: (ideaId) => run("listEvents", [ideaId], () => (seed.events ?? []).filter((e) => e.ideaId === ideaId)),
    listLessons: () => run("listLessons", [], () => (seed.events ?? []).filter((e) => e.kind === "review")),
    listScores: () => run("listScores", [], () => seed.scores ?? []),
    listScoreChanges: (ideaId) => run("listScoreChanges", [ideaId], () => (seed.changes ?? []).filter((c) => ideaId === undefined || c.ideaId === ideaId)),
    listPickable: () => run("listPickable", [], () => seed.companies ?? []),
    closesStatus: () => run("closesStatus", [], () => seed.closes ?? { latestOpenDay: null, latestOfficialDay: null, handEnteredDays: 0 }),
    anchorStatus: () =>
      run("anchorStatus", [], () => seed.anchorStatus ?? { sealedDays: 0, latestSealedDate: null, publishedDays: 0, waitingDays: 0, latestPublishedDate: null }),
    checkChain: () =>
      run("checkChain", [], () => ({
        chain: seed.chain ?? { ok: true, events: 0, firstBadSeq: null, badIdea: null },
        anchors: seed.anchors ?? { ok: true, days: 0, firstBadDate: null, reason: null },
      })),
    rescore: () => run("rescore", [], () => (seed.scores ?? []).length),
    itemCompany: (itemId) => run("itemCompany", [itemId], () => seed.itemCompanies?.[itemId] ?? null),
    setItemLink: (ideaId, itemId) => run("setItemLink", [ideaId, itemId], () => undefined),
  };
}
