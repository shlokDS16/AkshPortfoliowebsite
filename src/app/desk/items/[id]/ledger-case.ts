import { isLedgerCase, parseCaseRecord, type CaseRecordV1 } from "@/modules/casefile/client";

/** A ledger case study is told by the key alone (as the gate does); its record is shown only when it reads whole. */
export function ledgerCaseOf(structured: Record<string, unknown> | null | undefined): { isLedger: boolean; record: CaseRecordV1 | null } {
  if (!structured || !isLedgerCase(structured)) return { isLedger: false, record: null };
  return { isLedger: true, record: parseCaseRecord(structured.ledger) };
}
