"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { istDate } from "@/lib/dates";
import { InvalidInputError } from "@/lib/errors";
import type { ItemNoticeCode } from "@/lib/messages";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { lettersOn, runLetterSendNow, runVideoFetchNow, sendConfirmationsNow } from "@/modules/ops/jobs";
import { createSupabaseResearchRepo, isItemId } from "@/modules/research";
import { createSupabaseShowcaseRepo, loadSnapshot } from "@/modules/showcase/client";
import { createSupabaseLettersReads } from "./letters/repo";
import { approveSend, binRequests, cancelSend, eraseReader, makeLetter, saveLetter, setSignup, type LetterDeps } from "./letters/service";
import { createSendRpc } from "./send-rpc";
import { VideoError } from "./videos/errors";
import { FETCHED_RECENTLY, QUOTA_DEFERRED, VIDEOS_OFF } from "./videos/fetch";
import { createSupabaseVideosRepo } from "./videos/repo";
import { addTranscript, applyChapters, applyTitle, applyTranscript, type VideoChange, type VideoDeps } from "./videos/service";
import { MAX_CAPTION_BYTES } from "./videos/types";

// The desk's video writes (spec s7.6). Each starts with requireAdmin(); the id comes from the bound argument and the service checks it;
// nothing from the form but the dropped file reaches the record. A refusal is a fixed code in the redirect, never free text.
// The desk never writes to YouTube: "Fetch again" only asks YouTube again and refreshes the machine columns.

async function depsOf(): Promise<VideoDeps> {
  const db = await createSupabaseServerClient();
  return { videos: createSupabaseVideosRepo(db), research: createSupabaseResearchRepo(db) };
}

const pageOf = (itemId: unknown) => `/desk/videos/${encodeURIComponent(String(itemId))}`;

/** "Drop the caption file": stores the transcript as machine text. It is linked to a revision only by "Use this transcript". */
export async function addTranscriptAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const back = pageOf(itemId);
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) throw new InvalidInputError();
    // Checked on the declared size first, so a huge file is never read into memory; the parser checks the bytes again.
    if (file.size > MAX_CAPTION_BYTES) throw new VideoError("video-captions-too-big");
    await addTranscript(await depsOf(), itemId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (error) {
    failTo(back, error, "videos");
  }
  revalidatePath(back);
  doneTo(back, "transcript-stored");
}

async function change(itemId: string, run: (deps: VideoDeps) => Promise<VideoChange>, done: ItemNoticeCode): Promise<void> {
  await requireAdmin();
  const back = pageOf(itemId);
  let result: VideoChange;
  try {
    result = await run(await depsOf());
  } catch (error) {
    failTo(back, error, "videos");
  }
  revalidatePath(back);
  doneTo(back, !result.changed ? "video-unchanged" : result.pendingGate ? "revision-pending-gate" : done);
}

/** "Use this transcript": the newest stored transcript goes into one new revision. */
export async function useTranscriptAction(itemId: string): Promise<void> {
  return change(itemId, (deps) => applyTranscript(deps, itemId), "transcript-used");
}
/** "Use this title": YouTube's title becomes the item's title, on his press. */
export async function useTitleAction(itemId: string): Promise<void> {
  return change(itemId, (deps) => applyTitle(deps, itemId), "title-used");
}
/** "Use chapters from the description": his chapter lines from his own YouTube description. */
export async function useChaptersAction(itemId: string): Promise<void> {
  return change(itemId, (deps) => applyChapters(deps, itemId), "chapters-used");
}

/**
 * "Fetch again": one fresh fetch of this video's YouTube data. The jobs table is built around documents, so a video fetch is not queued
 * there; it runs now on the same code as the pump's `videos:fetch` step, one at a time (a second press during one is told so), and a
 * repeat is harmless. Admin only; the secret-key client lives in ops, not here.
 */
export async function fetchAgainAction(itemId: string): Promise<void> {
  await requireAdmin();
  const back = pageOf(itemId);
  let notice: ItemNoticeCode = "video-fetched";
  try {
    if (!isItemId(itemId)) throw new VideoError("video-not-found");
    const results = await runVideoFetchNow(itemId);
    if (results === null) throw new VideoError("video-fetch-busy");
    const [only] = results;
    if (only?.detail === VIDEOS_OFF) throw new VideoError("video-off");
    if (only?.detail === "no such video") throw new VideoError("video-not-found");
    if (only?.detail === FETCHED_RECENTLY) notice = "video-fetch-recent";
    if (!only?.ok) throw new Error("video fetch failed");
    if (only.detail === QUOTA_DEFERRED) notice = "video-deferred";
  } catch (error) {
    failTo(back, error, "videos");
  }
  revalidatePath(back);
  doneTo(back, notice);
}

// ---- Letters (Phase 5c, spec s8). Every action starts with requireAdmin(); the actor passed on is that admin's id, which the database checks
// ---- against the admin's profile again. With letters off (no ports) nothing that could lead to an email is recorded. A refusal is a fixed
// ---- code in the redirect. The public reader's actions are in public-actions.ts, which reaches none of this.

const LIST = "/desk/letters";
const NEW_LETTER = "/desk/letters/new";
const READERS = "/desk/letters/readers";
const letterPage = (itemId: unknown) => `${LIST}/${encodeURIComponent(String(itemId))}`;

async function lettersDeps(): Promise<LetterDeps> {
  const db = await createSupabaseServerClient();
  return {
    research: createSupabaseResearchRepo(db),
    reads: createSupabaseLettersReads(db),
    rpc: createSendRpc(),
    on: lettersOn(),
    snapshot: () => loadSnapshot(createSupabaseShowcaseRepo(createSupabasePublicClient()), istDate(new Date())),
    today: () => istDate(new Date()),
  };
}

const text = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** "Make this letter": the ticked changes (`revision`, one per tick) become a private letter, copied as they are on the site. */
export async function makeLetterAction(formData: FormData): Promise<void> {
  await requireAdmin();
  let itemId: string;
  try {
    itemId = (await makeLetter(await lettersDeps(), formData.getAll("revision").map(String))).itemId;
  } catch (error) {
    failTo(NEW_LETTER, error, "letters");
  }
  revalidatePath(LIST);
  doneTo(letterPage(itemId), "letter-made");
}

/** "Save": the subject, the one sentence and the note, stored as typed. */
export async function saveLetterAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const back = letterPage(itemId);
  let saved: { changed: boolean; pendingGate: boolean };
  try {
    saved = await saveLetter(await lettersDeps(), itemId, { subject: text(formData, "subject"), objective: text(formData, "objective"), note: text(formData, "note") });
  } catch (error) {
    failTo(back, error, "letters");
  }
  revalidatePath(back);
  doneTo(back, !saved.changed ? "letter-unchanged" : saved.pendingGate ? "revision-pending-gate" : "letter-saved");
}

/** Sends the approved rows on, after the response: the pump would take them within 15 minutes anyway. A failure here is the step's own heartbeat's to show. */
const kickSend = () =>
  after(async () => {
    try {
      await runLetterSendNow();
    } catch (error) {
      console.error("letters: send now failed", error instanceof Error ? error.name : typeof error); // the name only: a message can quote a row
    }
  });

async function approve(itemId: string, revisionId: string, kind: "subscribers" | "self_test", readTick: boolean, done: ItemNoticeCode): Promise<void> {
  const admin = await requireAdmin();
  const back = letterPage(itemId);
  try {
    await approveSend(await lettersDeps(), admin.userId, itemId, revisionId, kind, readTick);
  } catch (error) {
    failTo(back, error, "letters");
  }
  kickSend();
  revalidatePath(back);
  doneTo(back, done);
}

/** The dialog's "Send": records the approval (the audit row) for exactly this revision, then the send step runs at once. Needs the "I have read the preview" tick. */
export async function approveSendAction(itemId: string, revisionId: string, formData: FormData): Promise<void> {
  return approve(itemId, revisionId, "subscribers", formData.get("read") === "on", "send-approved");
}

/** "Send me a test copy": one email to ADMIN_EMAIL only. */
export async function sendTestCopyAction(itemId: string, revisionId: string): Promise<void> {
  return approve(itemId, revisionId, "self_test", true, "test-copy-approved");
}

/** Withdraws an approval that has not been claimed yet. */
export async function cancelSendAction(sendId: string, itemId: string): Promise<void> {
  const admin = await requireAdmin();
  const back = letterPage(itemId);
  try {
    await cancelSend(await lettersDeps(), admin.userId, sendId);
  } catch (error) {
    failTo(back, error, "letters");
  }
  revalidatePath(back);
  doneTo(back, "send-cancelled");
}

/** "Send confirmation emails": the readers ticked (`id`), or everyone waiting when none is ticked; at most 50 a day. */
export async function sendConfirmationsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  let notice: ItemNoticeCode;
  try {
    const chosen = formData.getAll("id").map(String);
    const ids = chosen.length > 0 ? chosen : (await createSupabaseLettersReads(await createSupabaseServerClient()).waiting()).map((w) => w.id);
    const batch = await sendConfirmationsNow(admin.userId, ids);
    notice = batch.requested === 0 ? "confirmations-none" : batch.capped ? "confirmations-capped" : batch.failed > 0 ? "confirmations-partial" : "confirmations-sent";
  } catch (error) {
    failTo(READERS, error, "letters");
  }
  revalidatePath(READERS);
  doneTo(READERS, notice);
}

/** "Bin": the ticked waiting requests (`id`), or all of them (`all`). Nothing is emailed to them. */
export async function binRequestsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  try {
    const deps = await lettersDeps();
    const ids = formData.get("all") === "1" ? (await deps.reads.waiting()).map((w) => w.id) : formData.getAll("id").map(String);
    await binRequests(deps, admin.userId, ids);
  } catch (error) {
    failTo(READERS, error, "letters");
  }
  revalidatePath(READERS);
  doneTo(READERS, "requests-binned");
}

/** "Erase an address" (a request received by email): the same answer whether or not it was on the list. */
export async function eraseReaderAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  try {
    await eraseReader(await lettersDeps(), admin.userId, text(formData, "email"));
  } catch (error) {
    failTo(READERS, error, "letters");
  }
  revalidatePath(READERS);
  doneTo(READERS, "reader-erased");
}

/** Sign-ups open or closed. Opening needs letters set up. */
export async function setSignupAction(on: boolean): Promise<void> {
  const admin = await requireAdmin();
  try {
    await setSignup(await lettersDeps(), admin.userId, on === true);
  } catch (error) {
    failTo(READERS, error, "letters");
  }
  revalidatePath(READERS);
  doneTo(READERS, on === true ? "signup-opened" : "signup-closed");
}
