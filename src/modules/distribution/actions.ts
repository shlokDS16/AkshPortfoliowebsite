"use server";

import { revalidatePath } from "next/cache";
import { InvalidInputError } from "@/lib/errors";
import type { ItemNoticeCode } from "@/lib/messages";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { runVideoFetchNow } from "@/modules/ops/jobs";
import { createSupabaseResearchRepo, isItemId } from "@/modules/research";
import { VideoError } from "./videos/errors";
import { QUOTA_DEFERRED, VIDEOS_OFF } from "./videos/fetch";
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
    if (!only?.ok) throw new Error("video fetch failed");
    if (only.detail === QUOTA_DEFERRED) notice = "video-deferred";
  } catch (error) {
    failTo(back, error, "videos");
  }
  revalidatePath(back);
  doneTo(back, notice);
}
