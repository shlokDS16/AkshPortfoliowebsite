// Server-side entry: drafting and refreshing a case study from a closed idea. Private (the desk). Public code never imports this.
import "server-only";

export { CASE_ERROR_TEXT, CaseError, caseErrorFromDb, type CaseErrorCode } from "./errors";
export { createSupabaseCasesRepo } from "./repo";
export { caseStateForIdea, caseSwitches, draftCaseStudy, recordDiffers, refreshCaseStudy } from "./service";
export type { CaseDeps, CaseState, CaseSwitches, CasesRepo } from "./types";
