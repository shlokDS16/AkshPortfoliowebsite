import "server-only";
import { dbError, jobDbError } from "@/lib/supabase/errors";
import type { Json } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import type { RefusalCode } from "./refusal";
import type { CellRow, ChosenCell, MachineRead, ScenarioRow, VersionRow, VersionStatus } from "./records";
import type { ModelObject, Report } from "./types";

// The valuation tables on whatever client the caller holds (migration 0017). Job code holds the secret-key client: it reads a version and
// writes the nine machine columns (column grants), and uploads the model object. Aksh's session reads everything (RLS, admin only) and
// writes only through the three functions and the one scenario delete. Errors from job code carry the operation and code only.

const BUCKET = "documents";
const VERSION_COLUMNS = "id, company_id, document_id, version_no, status, refusal, model_path, sheet_count, cell_count, formula_count, report, engine, read_at, confirmed_at, created_at";

type VersionData = {
  id: string; company_id: string; document_id: string; version_no: number; status: string; refusal: string | null; model_path: string | null;
  sheet_count: number | null; cell_count: number | null; formula_count: number | null; report: Json | null; engine: Json | null;
  read_at: string | null; confirmed_at: string | null; created_at: string;
};

// status and refusal are text columns with check constraints; report and engine are written by the step as the module's own types.
const toVersion = (r: VersionData): VersionRow => ({
  id: r.id, companyId: r.company_id, documentId: r.document_id, versionNo: r.version_no, status: r.status as VersionStatus, refusal: r.refusal as RefusalCode | null,
  modelPath: r.model_path, sheetCount: r.sheet_count, cellCount: r.cell_count, formulaCount: r.formula_count, report: r.report as Report | null,
  engine: r.engine as ModelObject["engine"] | null, readAt: r.read_at, confirmedAt: r.confirmed_at, createdAt: r.created_at,
});

export interface ValuationRepo {
  // Job code (the secret-key client).
  getByDocument(documentId: string): Promise<VersionRow | null>;
  /** Writes the machine columns of a version (never a confirmed one: the database refuses). */
  saveRead(versionId: string, read: MachineRead): Promise<void>;
  /** Stores the model object at models/<versionId>.json, replacing an earlier one (a re-run). */
  putModel(path: string, bytes: Uint8Array): Promise<void>;

  // Aksh's session.
  getVersion(versionId: string): Promise<VersionRow | null>;
  listCells(versionId: string): Promise<CellRow[]>;
  listScenarios(versionId: string): Promise<ScenarioRow[]>;
  getModel(path: string): Promise<Uint8Array>;
  confirm(versionId: string, cells: ChosenCell[]): Promise<void>;
  saveScenario(versionId: string, name: string, note: string, values: Record<string, number>): Promise<string>;
  deleteScenario(scenarioId: string): Promise<void>;
  /** A link to the model object that works for `seconds`. */
  signModel(path: string, seconds: number): Promise<string>;
}

/** What job code may do (ruling R7: handlers get repos, narrowed to what they need). */
export type MachineValuationRepo = Pick<ValuationRepo, "getByDocument" | "saveRead" | "putModel">;

export function machineValuation(repo: ValuationRepo): MachineValuationRepo {
  return {
    getByDocument: (documentId) => repo.getByDocument(documentId),
    saveRead: (versionId, read) => repo.saveRead(versionId, read),
    putModel: (path, bytes) => repo.putModel(path, bytes),
  };
}

export function createSupabaseValuationRepo(db: Db): ValuationRepo {
  return {
    async getByDocument(documentId) {
      const { data, error } = await db.from("valuation_versions").select(VERSION_COLUMNS).eq("document_id", documentId).maybeSingle();
      if (error) throw jobDbError("valuation.getByDocument", error);
      return data ? toVersion(data) : null;
    },
    async saveRead(versionId, read) {
      const columns =
        read.status === "ready"
          ? {
              status: "ready", refusal: null, model_path: read.modelPath, sheet_count: read.sheetCount, cell_count: read.cellCount, formula_count: read.formulaCount,
              report: read.report as unknown as Json, engine: read.engine as unknown as Json, read_at: read.readAt,
            }
          : { status: "refused", refusal: read.refusal, model_path: null, sheet_count: null, cell_count: null, formula_count: null, report: null, engine: null, read_at: read.readAt };
      const { error } = await db.from("valuation_versions").update(columns).eq("id", versionId);
      if (error) throw jobDbError("valuation.saveRead", error);
    },
    async putModel(path, bytes) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/json", upsert: true });
      if (error) throw jobDbError("valuation.putModel", { message: error.message });
    },

    async getVersion(versionId) {
      const { data, error } = await db.from("valuation_versions").select(VERSION_COLUMNS).eq("id", versionId).maybeSingle();
      if (error) throw dbError("valuation.getVersion", error);
      return data ? toVersion(data) : null;
    },
    async listCells(versionId) {
      const { data, error } = await db.from("valuation_cells").select("id, version_id, sheet, addr, role, label").eq("version_id", versionId).order("role", { ascending: false }).order("sheet").order("addr");
      if (error) throw dbError("valuation.listCells", error);
      return data.map((c) => ({ id: c.id, versionId: c.version_id, sheet: c.sheet, addr: c.addr, role: c.role as CellRow["role"], label: c.label }));
    },
    async listScenarios(versionId) {
      const { data, error } = await db
        .from("valuation_scenarios")
        .select("id, version_id, name, note, created_at, valuation_scenario_values(cell_id, value)")
        .eq("version_id", versionId)
        .order("created_at");
      if (error) throw dbError("valuation.listScenarios", error);
      return data.map((s) => ({
        id: s.id, versionId: s.version_id, name: s.name, note: s.note, createdAt: s.created_at,
        values: s.valuation_scenario_values.map((v) => ({ cellId: v.cell_id, value: Number(v.value) })),
      }));
    },
    async getModel(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error) throw dbError("valuation.getModel", { message: error.message });
      return new Uint8Array(await data.arrayBuffer());
    },
    async confirm(versionId, cells) {
      const { error } = await db.rpc("confirm_valuation_version", { p_version_id: versionId, p_cells: cells as unknown as Json });
      if (error) throw dbError("valuation.confirm", error);
    },
    async saveScenario(versionId, name, note, values) {
      const { data, error } = await db.rpc("save_valuation_scenario", { p_version_id: versionId, p_name: name, p_note: note, p_values: values as unknown as Json });
      if (error) throw dbError("valuation.saveScenario", error);
      return data;
    },
    async deleteScenario(scenarioId) {
      const { error } = await db.from("valuation_scenarios").delete().eq("id", scenarioId);
      if (error) throw dbError("valuation.deleteScenario", error);
    },
    async signModel(path, seconds) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
      if (error) throw dbError("valuation.signModel", { message: error.message });
      return data.signedUrl;
    },
  };
}
