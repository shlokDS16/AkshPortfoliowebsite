// Server-side entry: drafting and refreshing a case study from a closed idea. Private (the desk). Public code never imports this.
import "server-only";

export { CASE_ERROR_TEXT, CaseError, caseErrorFromDb, type CaseErrorCode } from "./errors";
export { loadCaseBlock, loadLedgerView } from "./desk";
export { createSupabaseCasesRepo } from "./repo";
export { caseBlockFor, caseStateForIdea, caseSwitches, draftCaseStudy, ledgerStatus, recordDiffers, refreshCaseStudy } from "./service";
export type { CaseDeps, CaseState, CaseSwitches, CasesRepo, LedgerStatus } from "./types";
