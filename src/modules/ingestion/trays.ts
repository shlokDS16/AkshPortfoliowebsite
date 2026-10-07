import type { DocumentStatus } from "@/modules/documents/client";
import type { StepKind, StepStatus, WaitReason } from "./types";

// Which tray a document sits in, and what its card says (spec s7). Derived, never stored. Pure: no clock, no I/O.

export type Tray = "ready" | "attention" | "reading" | "paused" | "waiting" | "finished";

export type DocState = {
  status: DocumentStatus;
  pageCount: number | null;
  pagesRead: number;
  aiOn: boolean;
  /** Proposals waiting for Aksh's check, and how many of them are flagged. */
  pending: number;
  flagged: number;
  steps: {
    kind: StepKind;
    status: StepStatus;
    notBefore: string;
    waitReason: WaitReason | null;
    pageNo: number | null;
    lastError: string | null;
    /** `lease_owner is not null or status <> 'queued'`: the machine has picked this step up at least once. */
    everClaimed: boolean;
  }[];
};

export type TrayView = { tray: Tray; message: string; attentionPages: number[]; extractDone: number; extractTotal: number };

export const UPLOAD_NOT_FINISHED = "Upload not finished. Choose the file again to resume.";
export const PDF_NOT_OPENED_TEXT = "This PDF could not be opened (it may be password-protected or damaged).";
export const QUEUED_TEXT = "Queued. Starts within 15 minutes, sooner while this page is open.";
const NO_FIGURES = "Read. No figures matched; open it beside your file.";
const NO_FIGURES_AI_OFF = "Read. AI reading is off; open it beside your file to enter figures.";
const CHOOSING = "Choosing the pages to read.";

const PAUSE_ORDER: WaitReason[] = ["groq_day", "groq_minute", "ai_off"];

/** "142", "142-147", "142-143, 150": consecutive pages collapse into a range. */
function pageList(pages: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j += 1;
    parts.push(j > i ? `${pages[i]}-${pages[j]}` : String(pages[i]));
    i = j + 1;
  }
  return parts.join(", ");
}

const figures = (n: number) => (n === 1 ? "1 figure" : `${n} figures`);

function pausedText(reason: WaitReason, eta: string | null): string {
  if (reason === "groq_day") return `Today's free AI allowance is used up. It carries on by itself${eta ? `: ${eta}` : ""}.`;
  if (reason === "groq_minute") return "Waiting a minute for the AI allowance.";
  return "AI reading is off.";
}

export function trayFor(d: DocState, now: Date, eta: string | null): TrayView {
  const extract = d.steps.filter((s) => s.kind === "extract_page" && s.status !== "skipped");
  const counts = { attentionPages: [] as number[], extractDone: extract.filter((s) => s.status === "done").length, extractTotal: extract.length };
  const view = (tray: Tray, message: string, attentionPages: number[] = []): TrayView => ({ ...counts, tray, message, attentionPages });

  if (d.status === "done") return view("finished", "Done with this document.");
  if (d.status === "skipped") return view("finished", "Skipped.");
  if (d.status === "uploading") return view("waiting", UPLOAD_NOT_FINISHED);

  const stuck = d.steps.filter((s) => s.status === "needs_attention");
  if (stuck.length > 0) {
    const pages = stuck.flatMap((s) => (s.kind === "extract_page" && s.pageNo !== null ? [s.pageNo] : [])).sort((a, b) => a - b);
    // The job step stored a plain sentence for itself (lost original, stopped twice); a page range is built here.
    const whole = stuck.find((s) => s.kind !== "extract_page");
    let message: string;
    if (whole) message = whole.lastError ?? (whole.kind === "pdf_text" ? PDF_NOT_OPENED_TEXT : "The desk could not choose the pages to read.");
    else message = `${pages.length === 1 ? "Page" : "Pages"} ${pageList(pages)} could not be read.`;
    if (d.pending > 0) message += ` ${d.pending === 1 ? "1 figure is" : `${d.pending} figures are`} ready to check.`;
    return view("attention", message, pages);
  }

  const unfinished = d.steps.filter((s) => s.status === "queued" || s.status === "running");
  const waits = unfinished.filter((s) => s.waitReason !== null && new Date(s.notBefore) > now);
  if (unfinished.length > 0 && waits.length === unfinished.length) {
    const reason = PAUSE_ORDER.find((r) => waits.some((s) => s.waitReason === r)) ?? "groq_minute";
    return view("paused", pausedText(reason, eta));
  }

  // A deferred or backing-off step has no lease again, so only a document whose steps were all never picked up is "waiting".
  if (!d.steps.some((s) => s.everClaimed)) return view("waiting", QUEUED_TEXT);

  if (unfinished.some((s) => s.kind === "pdf_text")) {
    const at = Math.max(1, d.pagesRead);
    return view("reading", d.pageCount === null ? `Reading page ${at}` : `Reading page ${at} of ${d.pageCount}`);
  }
  if (unfinished.some((s) => s.kind === "extract_page")) {
    return view("reading", `Reading figures: ${counts.extractDone} of ${counts.extractTotal} pages${eta ? `, ${eta}` : ""}`);
  }
  if (unfinished.length > 0) return view("reading", CHOOSING);

  if (d.pending > 0) return view("ready", `${figures(d.pending)} ready to check.${d.flagged > 0 ? ` ${d.flagged} ${d.flagged === 1 ? "needs" : "need"} a look.` : ""}`);
  return view("ready", !d.aiOn && counts.extractTotal === 0 ? NO_FIGURES_AI_OFF : NO_FIGURES);
}
