"use server";

import { requireAdmin } from "@/modules/identity";
import { readSelected, runInbox, setPageSelected } from "@/modules/ingestion";
import type { ActionResult } from "@/modules/ingestion/actions";
import { aiReadingOn } from "@/modules/ops/jobs";

// The two inbox buttons that depend on whether AI reading is on. They sit here, beside the pumps, because only
// this side may import @/modules/ops/jobs (ops imports ingestion; ingestion cannot import ops).

/** Ticks or unticks a page. With AI on, a ticked page is queued to be read; past the document's page budget it is refused. */
export async function setPageSelectedAction(documentId: string, pageNo: number, selected: boolean): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => setPageSelected(ports, documentId, pageNo, selected, aiReadingOn()));
}

/** For a document read while AI was off: queue every ticked page that has no step yet. */
export async function readSelectedAction(documentId: string): Promise<ActionResult> {
  await requireAdmin();
  return runInbox((ports) => readSelected(ports, documentId, aiReadingOn()));
}
