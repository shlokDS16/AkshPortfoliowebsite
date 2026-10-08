import type { DocumentStatus } from "@/modules/documents/client";
import { OCR_ATTENTION_TEXT, scansNotice } from "./ocr-copy";
import { isScanHeavy, PAGE_STEP_KINDS } from "./page-steps";
import type { StepKind, StepStatus, WaitReason } from "./types";

// Which tray a document sits in, and what its card says (spec s7). Derived, never stored. Pure: no clock, no I/O.

export type Tray = "ready" | "attention" | "reading" | "paused" | "waiting" | "finished";

export type DocState = {
  status: DocumentStatus;
  pageCount: number | null;
  pagesRead: number;
  /** Pages with under 50 characters of text (the page table's is_scan), whether or not they have been through the scan reader. */
  scanPages: number;
  aiOn: boolean;
  /** Proposals waiting for Aksh's check, and how many of them are flagged. */
  pending: number;
  flagged: number;
  /** Figures Aksh has already accepted, edited, dropped or filed. */
  decided: number;
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

type TrayStep = DocState["steps"][number];

export type TrayView = { tray: Tray; message: string; attentionPages: number[]; extractDone: number; extractTotal: number };

export const UPLOAD_NOT_FINISHED = "Upload not finished. Choose the file again to resume.";
export const PDF_NOT_OPENED_TEXT = "This PDF could not be opened (it may be password-protected or damaged).";
export const QUEUED_TEXT = "Queued. Starts within 15 minutes, sooner while this page is open.";
/** Every figure is decided: the review screen (and Done) is still one click away. Pending Shlok approval (spec s16.5). */
export const ALL_CHECKED = "All figures checked.";
const NO_FIGURES = "Read. No figures matched; open it beside your file.";
const NO_FIGURES_AI_OFF = "Read. AI reading is off; open it beside your file to enter figures.";
const CHOOSING = "Choosing the pages to read.";

const PAUSE_ORDER: WaitReason[] = ["groq_day", "ocr_day", "voice_day", "voice_hour", "groq_minute", "ocr_off", "ai_off"];
const isPageStep = (s: { kind: StepKind }) => PAGE_STEP_KINDS.includes(s.kind);

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
  if (reason === "ocr_day") return "Today's free scan reading is used up. It carries on by itself within 24 hours.";
  if (reason === "ocr_off") return "Scan reading is off.";
  if (reason === "voice_day") return "Today's free voice reading is used up. It carries on by itself within 24 hours.";
  if (reason === "voice_hour") return "Waiting for the next hour of voice reading. It carries on by itself.";
  return "AI reading is off.";
}

export function trayFor(d: DocState, now: Date, eta: string | null): TrayView {
  // Page steps (reading a scan, reading figures) are counted per page: a scan that is read and then read again is one page.
  const byPage = new Map<number, TrayStep[]>();
  for (const s of d.steps) if (isPageStep(s) && s.status !== "skipped" && s.pageNo !== null) byPage.set(s.pageNo, [...(byPage.get(s.pageNo) ?? []), s]);
  const counts = {
    attentionPages: [] as number[],
    extractDone: [...byPage.values()].filter((steps) => steps.every((s) => s.status === "done")).length,
    extractTotal: byPage.size,
  };
  const view = (tray: Tray, message: string, attentionPages: number[] = []): TrayView => ({ ...counts, tray, message, attentionPages });

  if (d.status === "done") return view("finished", "Done with this document.");
  if (d.status === "skipped") return view("finished", "Skipped.");
  if (d.status === "uploading") return view("waiting", UPLOAD_NOT_FINISHED);

  const stuck = d.steps.filter((s) => s.status === "needs_attention");
  if (stuck.length > 0) {
    const pages = [...new Set(stuck.flatMap((s) => (isPageStep(s) && s.pageNo !== null ? [s.pageNo] : [])))].sort((a, b) => a - b);
    // The job step stored a plain sentence for itself (lost original, stopped twice); a page range is built here.
    const whole = stuck.find((s) => !isPageStep(s));
    let message: string;
    if (whole) message = whole.lastError ?? (whole.kind === "pdf_text" ? PDF_NOT_OPENED_TEXT : "The desk could not choose the pages to read.");
    else {
      message = `${pages.length === 1 ? "Page" : "Pages"} ${pageList(pages)} could not be read.`;
      // Scan pages stored why (too big for the free reader, key refused...): when every stuck page says the same, say it once.
      const notes = new Set(stuck.map((s) => (s.kind === "ocr_page" && s.lastError && OCR_ATTENTION_TEXT.includes(s.lastError) ? s.lastError : null)));
      const note = notes.size === 1 ? [...notes][0] : null;
      if (note) message += ` ${note}`;
    }
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
  if (unfinished.some((s) => s.kind === "ocr_page")) {
    const scans = d.steps.filter((s) => s.kind === "ocr_page" && s.status !== "skipped");
    const read = scans.filter((s) => s.status === "done").length;
    return view("reading", `Reading scanned pages: ${read} of ${scans.length}${eta ? `, ${eta}` : ""}`);
  }
  if (unfinished.some((s) => s.kind === "extract_page")) {
    return view("reading", `Reading figures: ${counts.extractDone} of ${counts.extractTotal} pages${eta ? `, ${eta}` : ""}`);
  }
  if (unfinished.length > 0) return view("reading", CHOOSING);

  if (d.pending > 0) return view("ready", `${figures(d.pending)} ready to check.${d.flagged > 0 ? ` ${d.flagged} ${d.flagged === 1 ? "needs" : "need"} a look.` : ""}`);
  if (d.decided > 0) return view("ready", ALL_CHECKED);
  if (!d.aiOn && counts.extractTotal === 0) return view("ready", NO_FIGURES_AI_OFF);
  // A scanned document too big to be read whole waits for Aksh's ticks (ruling R6; pending Shlok approval, spec s16.7).
  if (counts.extractTotal === 0 && isScanHeavy(d.scanPages, d.pageCount)) return view("ready", scansNotice(d.scanPages));
  return view("ready", NO_FIGURES);
}
