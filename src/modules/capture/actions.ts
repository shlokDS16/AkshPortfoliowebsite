"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { errorShape } from "@/lib/errors";
import { featureOn } from "@/lib/features";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { startSourceRead } from "@/modules/ops/jobs";
import { isItemId } from "@/modules/research";
import { createSupabaseVideosRepo, createVideoFiling } from "@/modules/distribution";
import { createSourceFiling, createSupabaseSourcesRepo } from "@/modules/sources";
import { createCaptureDeps } from "./deps";
import { submitErrorCode, submitErrorText, type FilingErrorCode, type SubmitErrorCode } from "./messages";
import { CaptureNotRefilableError, refileCapture } from "./refile";
import { saveCapture, saveCaptureInput, type SaveCaptureDeps } from "./service";
import type { CaptureSource } from "./types";

/**
 * The capture deps on the admin's session, plus the two filings this action hands the service (distribution and sources are imported here,
 * never by the service): the source filing for `s:`, and the video filing for `v:` only while the own-channel videos are on. With it off a
 * `v:` capture is saved as a source (Phase 5d, spec s8).
 */
async function depsOf(): Promise<SaveCaptureDeps> {
  const db = await createSupabaseServerClient();
  return {
    ...createCaptureDeps(db),
    sources: createSourceFiling(createSupabaseSourcesRepo(db)),
    ...(featureOn("ownVideos") ? { videos: createVideoFiling(createSupabaseVideosRepo(db)) } : {}),
  };
}

export type SubmitCaptureInput = { clientId: string; rawText: string; source: CaptureSource };
export type SubmitCaptureResult =
  | { ok: true; captureId: string; itemId: string | null; duplicate: boolean; parseError: FilingErrorCode | null; sourceAnswer?: string }
  | { ok: false; retry: boolean; code: SubmitErrorCode; message: string };

const failure = (code: SubmitErrorCode, retry: boolean): SubmitCaptureResult => ({
  ok: false,
  retry,
  code,
  message: submitErrorText(code),
});

/**
 * Saves one quick capture. `retry` tells the device queue whether to keep the entry: a malformed or
 * empty entry would block the queue forever, so it is dropped (retry false); an infrastructure
 * failure is kept and sent again (retry true; the clientId makes the resend safe).
 */
export async function submitCapture(input: SubmitCaptureInput): Promise<SubmitCaptureResult> {
  await requireAdmin();
  const parsed = saveCaptureInput.safeParse(input);
  if (!parsed.success) return failure(submitErrorCode(parsed.error), false);
  try {
    const result = await saveCapture(await depsOf(), parsed.data);
    // A source saved for the first time is read right after the answer is sent (spec s6.4); the pump covers a read that fails.
    const readId = result.sourceReadId;
    if (readId) after(() => startSourceRead(readId));
    revalidatePath("/desk");
    return {
      ok: true,
      captureId: result.captureId,
      itemId: result.itemId,
      duplicate: result.duplicate,
      parseError: result.parseError,
      ...(result.sourceAnswer === undefined ? {} : { sourceAnswer: result.sourceAnswer }),
    };
  } catch (error) {
    // Name, operation and SQLSTATE only: a database message can carry row data.
    console.error("capture action failed", errorShape(error));
    return failure("save-failed", true);
  }
}

/** Files a stored capture again (the "File it now" button on a Needs you card). */
export async function refileCaptureAction(captureId: string): Promise<void> {
  await requireAdmin();
  if (!isItemId(captureId)) failTo("/desk", new CaptureNotRefilableError(), "capture");
  try {
    await refileCapture(await depsOf(), captureId, new Date());
  } catch (error) {
    failTo("/desk", error, "capture");
  }
  revalidatePath("/desk");
  doneTo("/desk", "refiled");
}
