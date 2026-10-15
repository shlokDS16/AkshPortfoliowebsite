import "server-only";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { isModelObject } from "./flows";
import type { RefusalCode } from "./refusal";
import type { ScenarioRow, VersionRow, VersionStatus } from "./records";
import { createSupabaseValuationRepo } from "./repo";
import type { Designation } from "./suggest";
import type { ModelObject, Report } from "./types";
import { confirmRows, scenarioCells, type ConfirmData, type ScenarioCell } from "./views";

// The model pages' reads (Plan 2.7 Task 3, spec s7), on Aksh's cookie session: RLS lets the admin read the versions, his rows and the
// model object (the bucket lets his session read models/ and never write there). The calculator does not use this: it loads the model
// object itself through modelUrlAction's signed link.

export type ModelHead = {
  versionId: string;
  versionNo: number;
  status: VersionStatus;
  companyId: string;
  /** "$KAVPUMP", or the company's name when it has no symbol. */
  company: string;
  documentId: string;
  fileTitle: string | null;
  readAt: string | null;
  formulaCount: number | null;
  report: Report | null;
  refusal: RefusalCode | null;
  /** The company's newest version, when it is not this one ("Version 4 exists: open it"). */
  newer: { versionId: string; versionNo: number } | null;
};

export type ModelPageData =
  | { mode: "confirm"; head: ModelHead; confirm: ConfirmData }
  | { mode: "scenarios"; head: ModelHead; cells: ScenarioCell[]; scenarios: ScenarioRow[] }
  | { mode: "refused" | "reading" | "unreadable"; head: ModelHead };

export type ModelListRow = { versionId: string; versionNo: number; status: VersionStatus; company: string; readAt: string | null; createdAt: string };

async function companyLabels(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.from("companies").select("id, name, nse_symbol").in("id", ids);
  if (error) throw dbError("models.companies", error);
  return new Map(data.map((c) => [c.id, c.nse_symbol ? `$${c.nse_symbol}` : c.name]));
}

async function readModel(db: Db, path: string | null): Promise<ModelObject | null> {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await createSupabaseValuationRepo(db).getModel(path)));
    return isModelObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function versionsOf(db: Db, companyId: string) {
  const { data, error } = await db.from("valuation_versions").select("id, version_no, status, model_path").eq("company_id", companyId).order("version_no", { ascending: false });
  if (error) throw dbError("models.versionsOf", error);
  return data;
}

/** The previous confirmed version's choices and model, for the carry-forward rule (spec s7.2), or null. */
async function previousConfirmed(db: Db, version: VersionRow, all: Awaited<ReturnType<typeof versionsOf>>) {
  const prev = all.find((v) => v.version_no < version.versionNo && v.status === "confirmed");
  if (!prev) return null;
  const model = await readModel(db, prev.model_path);
  if (!model) return null;
  const cells: Designation[] = (await createSupabaseValuationRepo(db).listCells(prev.id)).map((c) => ({ sheet: c.sheet, addr: c.addr, role: c.role }));
  return { versionNo: prev.version_no, model, cells };
}

export async function loadModelPage(db: Db, versionId: string): Promise<ModelPageData | null> {
  const repo = createSupabaseValuationRepo(db);
  const version = await repo.getVersion(versionId);
  if (!version) return null;
  const [labels, doc, all] = await Promise.all([
    companyLabels(db, [version.companyId]),
    db.from("documents").select("title").eq("id", version.documentId).maybeSingle(),
    versionsOf(db, version.companyId),
  ]);
  if (doc.error) throw dbError("models.document", doc.error);
  const newest = all[0];
  const head: ModelHead = {
    versionId: version.id, versionNo: version.versionNo, status: version.status, companyId: version.companyId, company: labels.get(version.companyId) ?? "",
    documentId: version.documentId, fileTitle: doc.data?.title ?? null, readAt: version.readAt, formulaCount: version.formulaCount, report: version.report,
    refusal: version.refusal, newer: newest && newest.id !== version.id ? { versionId: newest.id, versionNo: newest.version_no } : null,
  };
  if (version.status === "refused" || version.status === "reading") return { mode: version.status, head };

  const model = await readModel(db, version.modelPath);
  if (!model) return { mode: "unreadable", head };
  if (version.status === "ready") return { mode: "confirm", head, confirm: confirmRows(model, await previousConfirmed(db, version, all)) };
  const [cells, scenarios] = await Promise.all([repo.listCells(version.id), repo.listScenarios(version.id)]);
  return { mode: "scenarios", head, cells: scenarioCells(model, cells), scenarios };
}

/** /desk/models: each company's newest version, newest first. */
export async function listModels(db: Db): Promise<ModelListRow[]> {
  const { data, error } = await db.from("valuation_versions").select("id, company_id, version_no, status, read_at, created_at").order("version_no", { ascending: false });
  if (error) throw dbError("models.list", error);
  const newest = new Map<string, (typeof data)[number]>();
  for (const v of data) if (!newest.has(v.company_id)) newest.set(v.company_id, v);
  const labels = await companyLabels(db, [...newest.keys()]);
  return [...newest.values()]
    .map((v) => ({ versionId: v.id, versionNo: v.version_no, status: v.status as VersionStatus, company: labels.get(v.company_id) ?? "", readAt: v.read_at, createdAt: v.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The item page's "Model" link: the company's newest confirmed version, or null. */
export async function confirmedModelFor(db: Db, companyId: string): Promise<{ versionId: string; versionNo: number } | null> {
  const { data, error } = await db
    .from("valuation_versions")
    .select("id, version_no")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("models.confirmedFor", error);
  return data ? { versionId: data.id, versionNo: data.version_no } : null;
}
