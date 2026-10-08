import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { createSupabaseDocumentsRepo, type Basis, type DocumentStatus, type PageKind } from "@/modules/documents";
import { GROQ_CAPS, TOKENS_PER_PAGE_DEFAULT } from "./caps";
import { estimateReadyBy, formatReadyBy } from "./eta";
import { isScanHeavy, PAGE_STEP_KINDS } from "./page-steps";
import { tallyPending } from "./proposal-counts";
import { trayFor, type DocState, type TrayView } from "./trays";
import type { StepKind, StepStatus, WaitReason } from "./types";

// The inbox's read side: every document that is not finished plus the last few that are, each with the tray it sits in.

export type InboxDoc = {
  id: string;
  title: string;
  /** The company's symbol without the "$", or null. */
  company: string | null;
  createdAt: string;
  status: DocumentStatus;
  pageCount: number | null;
  budget: number;
  /** Figures waiting for Aksh's check, and the flagged ones among them. */
  pending: number;
  flagged: number;
  /** Figures Aksh has already accepted, edited, dropped or filed. */
  decided: number;
  view: TrayView;
  /**
   * Statement pages and ticked pages, plus the scan pages of a scanned document (so Aksh can tick them), never page text:
   * `firstLine` is the first line of the page, at most 120 characters.
   */
  pages: { pageNo: number; kind: PageKind | null; basis: Basis | null; firstLine: string; selected: boolean; by: "rule" | "aksh" | null; scan: boolean }[];
};

const FINISHED_SHOWN = 10;
const COLUMNS = "id, title, company_id, created_at, status, page_count, llm_page_budget, basis";

type DocRow = { id: string; title: string; company_id: string | null; created_at: string; status: string; page_count: number | null; llm_page_budget: number; basis: string };
type StepRow = {
  kind: string; status: string; not_before: string; wait_reason: string | null; page_no: number | null; last_error: string | null; lease_owner: string | null;
};
type PageRow = {
  document_id: string; page_no: number; kind: string | null; basis: string | null; selected: boolean; selected_by: string | null; first_line: string | null;
  is_scan: boolean | null;
};

const firstLineOf = (text: string | null) => (text ?? "").split("\n")[0].trim();

const toSteps = (rows: StepRow[]): DocState["steps"] =>
  rows.map((r) => ({
    kind: r.kind as StepKind,
    status: r.status as StepStatus,
    notBefore: r.not_before,
    waitReason: r.wait_reason as WaitReason | null,
    pageNo: r.page_no,
    lastError: r.last_error,
    everClaimed: r.lease_owner !== null || r.status !== "queued",
  }));

/**
 * "ready by 11:40" for the pages still to read (a scan is counted once; its figures follow it); the day's allowance is
 * treated as spent when a step waits on it.
 */
export function etaFor(steps: DocState["steps"], now: Date): string | null {
  const left = steps.filter((s) => PAGE_STEP_KINDS.includes(s.kind) && (s.status === "queued" || s.status === "running")).length;
  if (left === 0) return null;
  const dayWait = steps.some((s) => s.waitReason === "groq_day" && new Date(s.notBefore) > now);
  const eta = estimateReadyBy({
    pagesLeft: left,
    tokensPerPage: TOKENS_PER_PAGE_DEFAULT,
    usedToday: dayWait ? GROQ_CAPS.tpd : 0,
    caps: { tpm: GROQ_CAPS.tpm, tpd: GROQ_CAPS.tpd },
    now,
    tabOpen: true, // this list is read while the inbox tab is open and keeps reading
  });
  return formatReadyBy(eta, now);
}

export async function listInbox(
  db: Db,
  now: Date,
  aiOn: boolean,
): Promise<{ docs: InboxDoc[]; usage: { storageBytes: number; databaseBytes: number }; aiOn: boolean }> {
  const [open, finished, usage] = await Promise.all([
    db.from("documents").select(COLUMNS).in("status", ["uploading", "active"]).order("created_at", { ascending: false }),
    db.from("documents").select(COLUMNS).in("status", ["done", "skipped"]).order("updated_at", { ascending: false }).limit(FINISHED_SHOWN),
    createSupabaseDocumentsRepo(db).usage(),
  ]);
  if (open.error) throw dbError("inbox.listOpen", open.error);
  if (finished.error) throw dbError("inbox.listFinished", finished.error);
  const rows: DocRow[] = [...open.data, ...finished.data];
  const openIds = open.data.map((d) => d.id);
  const activeIds = open.data.filter((d) => d.status === "active").map((d) => d.id);
  const companyIds = [...new Set(rows.flatMap((d) => (d.company_id ? [d.company_id] : [])))];

  const [jobs, pages, companies, proposals] = await Promise.all([
    activeIds.length === 0
      ? { data: [], error: null }
      : db
          .from("jobs")
          .select("document_id, job_steps(kind, status, not_before, wait_reason, page_no, last_error, lease_owner)")
          .in("document_id", activeIds)
          .is("cancelled_at", null),
    activeIds.length === 0
      ? { data: [], error: null }
      : db
          .from("document_pages")
          .select("document_id, page_no, kind, basis, selected, selected_by, first_line, is_scan")
          .in("document_id", activeIds)
          .or("kind.not.is.null,selected.eq.true,is_scan.eq.true")
          .order("document_id")
          .order("page_no"),
    companyIds.length === 0 ? { data: [], error: null } : db.from("companies").select("id, nse_symbol").in("id", companyIds),
    // At most 60 per document (MAX_PROPOSALS_PER_DOCUMENT). The reading is needed to leave out the standalone repeats
    // of a consolidated line, as the review screen does; filed ones are read only to count as decided.
    activeIds.length === 0
      ? { data: [], error: null }
      : db
          .from("proposals")
          .select("id, document_id, flags, status, machine_value, accepted_value")
          .in("document_id", activeIds),
  ]);
  if (jobs.error) throw dbError("inbox.listSteps", jobs.error);
  if (pages.error) throw dbError("inbox.listPages", pages.error);
  if (companies.error) throw dbError("inbox.listCompanies", companies.error);
  if (proposals.error) throw dbError("inbox.listProposals", proposals.error);
  const waiting = tallyPending(proposals.data, new Map(rows.map((d) => [d.id, d.basis as Basis])));

  const stepsOf = new Map<string, StepRow[]>(jobs.data.map((j) => [j.document_id, j.job_steps]));
  const symbolOf = new Map(companies.data.map((c) => [c.id, c.nse_symbol]));
  const pagesOf = new Map<string, PageRow[]>();
  for (const p of pages.data as PageRow[]) pagesOf.set(p.document_id, [...(pagesOf.get(p.document_id) ?? []), p]);

  // How far the PDF read has got: the pages stored so far, asked only of documents still being read.
  const reading = new Set(
    [...stepsOf].filter(([, steps]) => steps.some((s) => s.kind === "pdf_text" && (s.status === "queued" || s.status === "running"))).map(([id]) => id),
  );
  const readCounts = new Map<string, number>();
  await Promise.all(
    openIds
      .filter((id) => reading.has(id))
      .map(async (id) => {
        const { count, error } = await db.from("document_pages").select("page_no", { count: "exact", head: true }).eq("document_id", id);
        if (error) throw dbError("inbox.countPages", error);
        readCounts.set(id, count ?? 0);
      }),
  );

  const docs = rows.map((d): InboxDoc => {
    const steps = toSteps(stepsOf.get(d.id) ?? []);
    const scans = (pagesOf.get(d.id) ?? []).filter((p) => p.is_scan).length;
    const listScans = isScanHeavy(scans, d.page_count);
    const state: DocState = {
      status: d.status as DocumentStatus,
      pageCount: d.page_count,
      pagesRead: readCounts.get(d.id) ?? 0,
      scanPages: scans,
      aiOn,
      pending: waiting.get(d.id)?.pending ?? 0,
      flagged: waiting.get(d.id)?.flagged ?? 0,
      decided: waiting.get(d.id)?.decided ?? 0,
      steps,
    };
    return {
      id: d.id,
      title: d.title,
      company: d.company_id ? (symbolOf.get(d.company_id) ?? null) : null,
      createdAt: d.created_at,
      status: state.status,
      pageCount: d.page_count,
      budget: d.llm_page_budget,
      pending: state.pending,
      flagged: state.flagged,
      decided: state.decided,
      view: trayFor(state, now, etaFor(steps, now)),
      // A cover page that happens to have little text is not offered: only a mostly scanned document lists its scans.
      pages: (pagesOf.get(d.id) ?? [])
        .filter((p) => !p.is_scan || listScans || p.selected || p.kind !== null)
        .map((p) => ({
          pageNo: p.page_no,
          kind: p.kind as PageKind | null,
          basis: p.basis as Basis | null,
          firstLine: firstLineOf(p.first_line),
          selected: p.selected,
          by: p.selected_by as "rule" | "aksh" | null,
          scan: p.is_scan ?? false,
        })),
    };
  });
  return { docs, usage, aiOn };
}

/** Existing companies the drop bar can file an upload under (screened or not: the upload only needs the link). */
export async function listCompanyOptions(db: Db): Promise<{ id: string; symbol: string }[]> {
  const { data, error } = await db.from("companies").select("id, nse_symbol").is("archived_at", null).not("nse_symbol", "is", null).order("nse_symbol");
  if (error) throw dbError("inbox.companyOptions", error);
  return data.flatMap((c) => (c.nse_symbol ? [{ id: c.id, symbol: c.nse_symbol }] : []));
}

/**
 * The Inbox tab's badge: documents in Ready for you or Needs attention. Two small reads, so every desk page can ask;
 * the tray rules are the inbox's own (pages read and proposals do not change which of the two a document is in).
 */
export async function countInbox(db: Db, now: Date): Promise<number> {
  const open = await db.from("documents").select("id, status").eq("status", "active");
  if (open.error) throw dbError("inbox.countOpen", open.error);
  if (open.data.length === 0) return 0;
  const jobs = await db
    .from("jobs")
    .select("document_id, job_steps(kind, status, not_before, wait_reason, page_no, last_error, lease_owner)")
    .in("document_id", open.data.map((d) => d.id))
    .is("cancelled_at", null);
  if (jobs.error) throw dbError("inbox.countSteps", jobs.error);
  const stepsOf = new Map<string, StepRow[]>(jobs.data.map((j) => [j.document_id, j.job_steps]));
  return open.data.filter((d) => {
    const state: DocState = { status: "active", pageCount: null, pagesRead: 0, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps: toSteps(stepsOf.get(d.id) ?? []) };
    const { tray } = trayFor(state, now, null);
    return tray === "ready" || tray === "attention";
  }).length;
}
