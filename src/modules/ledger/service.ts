import { combineChecks } from "./chain";
import { LedgerError } from "./errors";
import { journalGrid } from "./journal";
import { eventInput, isLedgerId, openIdeaInput, toStance } from "./schema";
import { summarise } from "./summary";
import type { ChainStatus, GridCell, Idea, IdeaEvent, IdeaScore, LedgerRepo, ScoreChange, Summary } from "./types";

// The service validates first and calls the repo second: a refused input never reaches the database. The database's own
// refusals come back from the repo as typed LedgerErrors (errors.ts), so nothing here rewrites them.

export type LedgerView = {
  ideas: Idea[];
  scores: IdeaScore[];
  changes: ScoreChange[];
  summary: Summary;
  grid: Record<GridCell, string[]>;
};

export type IdeaDetail = { idea: Idea; events: IdeaEvent[]; score: IdeaScore | null; changes: ScoreChange[] };

/** Records a new idea (the `open` entry is sealed with it). Returns the idea's id. `input` is untrusted. */
export async function openIdea(repo: LedgerRepo, input: unknown): Promise<string> {
  const parsed = openIdeaInput.parse(input);
  // The link follows the company: the publish gate reads ideas.item_id and nothing unlinks it, so a file of another company
  // (or no file at all) is refused here before the database is reached; open_idea() refuses it again, and has the last word.
  if (parsed.itemId !== null && (await repo.itemCompany(parsed.itemId)) !== parsed.companyId) throw new LedgerError("ledger-item-other-company");
  return repo.openIdea(parsed);
}

/** Adds a note, revision, resize, close, lesson or withdrawal to an idea. Returns the entry's id. `input` is untrusted. */
export async function addIdeaEvent(repo: LedgerRepo, ideaId: string, input: unknown): Promise<string> {
  const parsed = eventInput.parse(input);
  if (!isLedgerId(ideaId)) throw new LedgerError("ledger-bad-input");
  return repo.addEvent({ ideaId, kind: parsed.kind, bodyMd: parsed.bodyMd, stance: toStance(parsed) });
}

/** Everything the Ledger page and the Journal page need. `today` is an India date (YYYY-MM-DD). */
export async function loadLedger(repo: LedgerRepo, today: string): Promise<LedgerView> {
  const [ideas, scores, changes] = await Promise.all([repo.listIdeas(), repo.listScores(), repo.listScoreChanges()]);
  return { ideas, scores, changes, summary: summarise(ideas, scores, today, changes), grid: journalGrid(ideas, scores) };
}

/** One idea with its entries in order, its score and its restatements; null when there is no such idea. */
export async function loadIdea(repo: LedgerRepo, ideaId: string): Promise<IdeaDetail | null> {
  if (!isLedgerId(ideaId)) return null;
  const idea = await repo.getIdea(ideaId);
  if (!idea) return null;
  const [events, scores, changes] = await Promise.all([repo.listEvents(ideaId), repo.listScores(), repo.listScoreChanges(ideaId)]);
  return {
    idea,
    events: [...events].sort((a, b) => a.seq - b.seq),
    score: scores.find((s) => s.ideaId === ideaId) ?? null,
    changes,
  };
}

/** Runs both integrity checks. Passing means the ledger is consistent with itself, nothing stronger. */
export async function checkLedger(repo: LedgerRepo): Promise<ChainStatus> {
  return combineChecks(await repo.checkChain());
}

/** Recomputes every score in SQL, after a close or a corporate action was entered. */
export async function rescoreLedger(repo: LedgerRepo): Promise<number> {
  return repo.rescore();
}

/** Links an idea to a company file, or removes the link (null). The link is a private convenience, not sealed. */
export async function linkIdeaToItem(repo: LedgerRepo, ideaId: string, itemId: string | null): Promise<void> {
  if (!isLedgerId(ideaId) || (itemId !== null && !isLedgerId(itemId))) throw new LedgerError("ledger-bad-input");
  await repo.setItemLink(ideaId, itemId);
}
