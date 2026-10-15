import { isUuid } from "@/lib/ids";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { caseErrorFromDb } from "./errors";
import type { CasesRepo } from "./types";

// The admin's own cookie client (RLS, admin only), never the service client. The only function calls are the two admin doors the
// database offers for case studies (migration 0018); every read is of a named table the admin may already read.

// One alias step, exactly as the gate's case_company check follows it (company_aliases.symbol = the stub's nse_symbol, migration 0018):
// a longer chain would file the draft under a company the gate refuses.
const MAX_ALIAS_HOPS = 1;

export function createSupabaseCasesRepo(db: Db): CasesRepo {
  return {
    async buildRecord(ideaId) {
      const { data, error } = await db.rpc("case_study_record", { p_idea_id: ideaId });
      if (error) throw caseErrorFromDb("cases.buildRecord", error);
      return data;
    },

    async switches() {
      const { data, error } = await db.rpc("case_study_switches");
      if (error) throw caseErrorFromDb("cases.switches", error);
      const row = data?.[0];
      // A missing row is "off": the desk must never tell the owner a switch is on when the database did not say so.
      return { reveal: row?.reveal === true, chart: row?.chart === true };
    },

    async resolveCompany(companyId) {
      let current = companyId;
      for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
        const company = await db.from("companies").select("nse_symbol").eq("id", current).maybeSingle();
        if (company.error) throw dbError("cases.resolveCompany", company.error);
        const symbol = company.data?.nse_symbol;
        if (!symbol) return current;
        const alias = await db.from("company_aliases").select("company_id").eq("symbol", symbol).maybeSingle();
        if (alias.error) throw dbError("cases.resolveCompany", alias.error);
        if (!alias.data || alias.data.company_id === current) return current;
        current = alias.data.company_id;
      }
      return current;
    },

    async findItemForIdea(ideaId) {
      if (!isUuid(ideaId)) return null;
      const { data, error } = await db
        .from("item_revisions")
        .select("item_id")
        .eq("structured->ledger->>idea", ideaId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("cases.findItemForIdea", error);
      return data?.item_id ?? null;
    },
  };
}
