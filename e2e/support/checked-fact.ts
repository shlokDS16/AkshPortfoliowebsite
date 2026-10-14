import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./auth";

// One filed, provenance-backed fact for the public "Printed on p. N" line (Plan 2b Task 9): the seeded Kaveri file's F2 (Gross
// margin 31.4 %, p. 140) as if it had come through the inbox. Written the way the inbox writes it: the machine (secret key)
// stores the page, the extraction and a pending proposal; the admin's own session files it and records the provenance. F1 and F3
// are left typed by hand, so the line must appear on F2 and nowhere else. LOCAL stack only (requireStack). Idempotent by title.
export const CHECKED_DOC = "Kaveri annual report p. 140 (e2e provenance, fictional)";
export const CHECKED_PAGE = 140;

/** True when it wrote the rows, false when they were already there. */
export async function seedCheckedFact(admin: Db, itemTitle: string): Promise<boolean> {
  const item = (await admin.from("items").select("id, current_revision_id").eq("title", itemTitle).order("created_at").limit(1).single()).data;
  if (!item?.current_revision_id) throw new Error(`seed: no published revision of "${itemTitle}"`);
  // Done when the provenance row exists (the last write), so a run that stopped half-way is finished next time.
  if ((await admin.from("fact_provenance").select("id").eq("revision_id", item.current_revision_id).eq("fact_id", "F2").maybeSingle()).data) return false;
  const stack = requireStack();
  const service = createClient<Database>(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ok = <T>(r: { data: T; error: unknown }): NonNullable<T> => {
    if (r.error || r.data === null || r.data === undefined) throw r.error ?? new Error("seed: empty answer");
    return r.data;
  };
  const text = "Gross margin 31.4 30.9";
  const doc = ok(await admin.from("documents").insert({ title: CHECKED_DOC, sha256: randomBytes(32).toString("hex"), bytes: 1000, status: "uploading" }).select("id").single());
  await admin.from("documents").update({ status: "skipped" }).eq("id", doc.id); // out of the inbox
  ok(await service.from("document_pages").insert({ document_id: doc.id, page_no: CHECKED_PAGE, text }).select("page_no").single());
  const extraction = ok(
    await service.from("extractions").insert({ document_id: doc.id, page_no: CHECKED_PAGE, model: "e2e", prompt_version: "e2e", input_hash: randomBytes(32).toString("hex"), output: {} }).select("id").single(),
  );
  const fact = {
    label: "Gross margin", value: 31.4, valueText: "31.4", unit: "%", period: "FY26", asOf: "2026-03-31", page: CHECKED_PAGE, locator: `p. ${CHECKED_PAGE}`,
    quote: text, basis: "consolidated", topic: "margin", statement: "pl", prior: { label: "FY25", value: 30.9, valueText: "30.9" },
  };
  const proposal = ok(
    await service.from("proposals").insert({ document_id: doc.id, page_no: CHECKED_PAGE, extraction_id: extraction.id, dedupe_key: "gross margin|FY26|consolidated", machine_value: fact, reason: "core" }).select("id").single(),
  );
  ok(await admin.from("proposals").update({ status: "filed", accepted_value: fact, item_id: item.id, revision_id: item.current_revision_id, decided_at: new Date().toISOString() }).eq("id", proposal.id).select("id").single());
  ok(await admin.from("fact_provenance").insert({ revision_id: item.current_revision_id, fact_id: "F2", proposal_id: proposal.id, edited: false }).select("id").single());
  return true;
}
