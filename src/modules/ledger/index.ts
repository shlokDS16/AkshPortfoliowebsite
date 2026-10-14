// Server-side entry: the repo, the service and the gate's reads. Client components import "./client" only.
import "server-only";

export * from "./client";
export { LedgerError, ledgerErrorFromDb } from "./errors";
export { eventInput, isLedgerId, openIdeaInput, toStance, type EventInput, type OpenIdeaInput } from "./schema";
export { createSupabaseLedgerRepo } from "./repo";
export {
  addCorporateAction, addIdeaEvent, checkLedger, enterClose, loadIdea, loadLedger, openIdea, rescoreLedger, type IdeaDetail, type LedgerView,
} from "./service";
export { ledgerGateFacts, type LedgerGateFacts } from "./gate";
export { buildIdeaPage, buildLedgerHome, buildClosesPage, buildJournal, getClosesPage, getIdeaPage, getItemCompany, getJournal, getLedgerHome, listPickCompanies, type ChainState, type ClosesPage, type IdeaPage, type LedgerHome, type AddKind } from "./queries";
