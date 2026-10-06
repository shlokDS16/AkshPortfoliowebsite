import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { CaptureRecord, CaptureRepo, CaptureSource } from "./types";

const CAPTURE_COLUMNS = "id, raw_text, parsed, item_id, company_id, theme_id, source, client_id, created_at";
const LIST_COLUMNS = "id, raw_text, created_at, item_id, company_id, parsed, companies(nse_symbol, name)";
const LIST_LIMIT = 1000;

type CaptureRow = {
  id: string;
  raw_text: string;
  parsed: Json | null;
  item_id: string | null;
  company_id: string | null;
  theme_id: string | null;
  source: string;
  client_id: string | null;
  created_at: string;
};

function asRecord(value: Json | null): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const toRecord = (r: CaptureRow): CaptureRecord => ({
  id: r.id,
  rawText: r.raw_text,
  parsed: asRecord(r.parsed),
  itemId: r.item_id,
  companyId: r.company_id,
  themeId: r.theme_id,
  source: r.source as CaptureSource,
  clientId: r.client_id,
  createdAt: r.created_at,
});

export function createSupabaseCaptureRepo(db: Db): CaptureRepo {
  return {
    async findByClientId(clientId) {
      const { data, error } = await db.from("captures").select(CAPTURE_COLUMNS).eq("client_id", clientId).maybeSingle();
      if (error) throw dbError("capture.findByClientId", error);
      return data ? toRecord(data) : null;
    },
    async insertRaw({ rawText, source, clientId }) {
      const { data, error } = await db
        .from("captures")
        .insert({ raw_text: rawText, source, client_id: clientId })
        .select(CAPTURE_COLUMNS)
        .single();
      if (error) throw dbError("capture.insertRaw", error);
      return toRecord(data);
    },
    async attach(id, patch) {
      // raw_text is never in the update: a trigger refuses any change to it.
      const update: TablesUpdate<"captures"> = { parsed: patch.parsed as Json };
      if (patch.itemId !== undefined) update.item_id = patch.itemId;
      if (patch.companyId !== undefined) update.company_id = patch.companyId;
      if (patch.themeId !== undefined) update.theme_id = patch.themeId;
      const { error } = await db.from("captures").update(update).eq("id", id);
      if (error) throw dbError("capture.attach", error);
    },
    async listSince(sinceIso) {
      const { data, error } = await db
        .from("captures")
        .select(LIST_COLUMNS)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw dbError("capture.listSince", error);
      return data.map((r) => {
        const parsed = asRecord(r.parsed);
        return {
          id: r.id,
          rawText: r.raw_text,
          createdAt: r.created_at,
          itemId: r.item_id,
          companyId: r.company_id,
          companySymbol: r.companies?.nse_symbol ?? null,
          companyName: r.companies?.name ?? null,
          parseError: typeof parsed?.error === "string" ? parsed.error : null,
        };
      });
    },
  };
}
