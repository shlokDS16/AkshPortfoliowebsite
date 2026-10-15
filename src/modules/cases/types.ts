import type { ResearchRepo } from "@/modules/research";

/** The storage and database port of the cases module. The admin's cookie client implements it (repo.ts); tests use a fake. */
export interface CasesRepo {
  /** The ledger record for a closed idea, exactly as the database builds it. Throws a CaseError when the idea is not ready. */
  buildRecord(ideaId: string): Promise<unknown>;
  /** The two owner switches, as the database reads them. */
  switches(): Promise<CaseSwitches>;
  /** The company a sealed company id stands for today: itself, or the company it was merged into (company_aliases). */
  resolveCompany(companyId: string): Promise<string>;
  /** The item that already carries a record for this idea in any of its revisions, oldest first; null when there is none. */
  findItemForIdea(ideaId: string): Promise<string | null>;
}

export type CaseSwitches = { reveal: boolean; chart: boolean };

/** What the Ledger idea page says about a case study (spec s33.8). */
export type CaseState =
  | { state: "not_closed" | "void" | "no_lesson" | "exit_pending" }
  | { state: "ready"; figuresTo: string; earliest: string }
  | { state: "draft" | "public"; itemId: string };

export type CaseDeps = { cases: CasesRepo; research: ResearchRepo };

/** The ledger against one case study item (spec s33.8): see ledgerStatus. */
export type LedgerStatus = { differs: boolean; figuresTo: string; dateOut: boolean; frozen: boolean };
