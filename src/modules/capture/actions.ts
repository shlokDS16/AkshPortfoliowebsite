"use server";

import { revalidatePath } from "next/cache";
import { errorShape } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createCaptureDeps } from "./deps";
import { submitErrorCode, submitErrorText, type FilingErrorCode, type SubmitErrorCode } from "./messages";
import { saveCapture, saveCaptureInput } from "./service";
import type { CaptureSource } from "./types";

export type SubmitCaptureInput = { clientId: string; rawText: string; source: CaptureSource };
export type SubmitCaptureResult =
  | { ok: true; captureId: string; itemId: string | null; duplicate: boolean; parseError: FilingErrorCode | null }
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
    const result = await saveCapture(createCaptureDeps(await createSupabaseServerClient()), parsed.data);
    revalidatePath("/desk");
    return {
      ok: true,
      captureId: result.captureId,
      itemId: result.itemId,
      duplicate: result.duplicate,
      parseError: result.parseError,
    };
  } catch (error) {
    // Name, operation and SQLSTATE only: a database message can carry row data.
    console.error("capture action failed", errorShape(error));
    return failure("save-failed", true);
  }
}
