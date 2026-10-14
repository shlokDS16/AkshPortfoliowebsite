import { audioMimeOfPath, VOICE_MAX_BYTES } from "@/modules/documents";
import { SHORT_WAIT_MS, WHISPER_BUCKET, WHISPER_CAPS, WHISPER_WAIT } from "../caps";
import { llmTimeoutMs } from "../deadline";
import { callWithinUnits } from "../governor";
import type { StepContext, StepHandler, StepOutcome } from "../types";
import { VOICE_NOT_STORED, VOICE_NOTHING_HEARD, VOICE_OFF, VOICE_TOO_BIG } from "../voice-copy";
import { reservationSeconds, settledSeconds } from "../voice-budget";

// transcribe (Plan 2b Task 4): one voice note, typed out by Whisper and stored as the text of page 1 of its document. It reserves
// the audio seconds in the unit ledger, sends the recording, and settles the seconds the provider reports. The transcript is
// Aksh's own voice: this step never files it, never makes a capture and never decides anything. He reads it, edits it and
// saves it himself (the card in the inbox). A refusal is a wait or a sentence, never a failure count. Every write is idempotent.

const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };
/**
 * A timeout or a 413 may still have been counted by Groq (it may have processed the audio before the answer was lost), so those
 * keep their seconds in the ledger; any other failure released nothing it used.
 */
const MAY_HAVE_BEEN_COUNTED = /^(TimeoutError|AbortError|HTTP 413)$/;
const attention = (error: string): StepOutcome => ({ kind: "attention", error });

export const transcribe: StepHandler = async (ctx: StepContext) => {
  const { step, documentId, deps } = ctx;
  const { documents, usage } = deps.repos;

  const doc = await documents.get(documentId);
  if (!doc || doc.kind !== "audio") return attention(VOICE_NOT_STORED);

  // Typed out before (a rerun after a lost lease): no second request, no second charge against the allowance.
  const typed = await documents.getPage(doc.id, 1);
  if (typed && typed.text.trim().length > 0) return { kind: "done", result: { chars: typed.text.length, already: true } };

  const path = doc.storagePath;
  const mime = path ? audioMimeOfPath(path) : null;
  if (!path || !mime || doc.originalDeletedAt) return attention(VOICE_NOT_STORED);
  const transcriber = deps.transcriber;
  if (!transcriber) return attention(VOICE_OFF);

  const timeoutMs = llmTimeoutMs(ctx.deadline, deps.clock);
  if (timeoutMs === null) return { kind: "defer", notBefore: new Date(deps.now().getTime() + SHORT_WAIT_MS), reason: "groq_minute" };

  // A storage failure throws: the runner retries the step before any sentence.
  const bytes = await documents.download(path);
  if (bytes.byteLength > VOICE_MAX_BYTES) return attention(VOICE_TOO_BIG);

  const reserved = reservationSeconds(bytes.byteLength, step.args.seconds);
  const extension = path.slice(path.lastIndexOf(".") + 1);
  const caps = { hour: WHISPER_CAPS.secondsHour, day: WHISPER_CAPS.secondsDay, rpm: WHISPER_CAPS.rpm, rpd: WHISPER_CAPS.rpd };
  const budget = await callWithinUnits({ usage, now: deps.now }, WHISPER_BUCKET, reserved, caps, async () => {
    const result = await transcriber.transcribe({ bytes, mime, name: `voice.${extension}` }, { timeoutMs });
    // The provider counted the call when it answered; the seconds settle at the length it reported (at least 10).
    const maybeCounted = result.kind === "provider_error" && MAY_HAVE_BEEN_COUNTED.test(result.message);
    return { result, spent: result.kind === "ok" ? settledSeconds(result.seconds, reserved) : maybeCounted ? reserved : false };
  });
  if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };

  const out = budget.result;
  if (out.kind === "provider_error") return { kind: "retry", failure: "provider", error: out.message.slice(0, 400) };
  if (out.kind === "rate_limited") {
    const wait = Math.max(out.retryAfterSeconds ?? WHISPER_WAIT.defaultSeconds, 1);
    const reason = wait > WHISPER_WAIT.dayAfterSeconds ? "voice_day" : wait > WHISPER_WAIT.hourAfterSeconds ? "voice_hour" : "groq_minute";
    const notBefore = new Date(deps.now().getTime() + wait * 1000);
    await usage.block(WHISPER_BUCKET, "rate_limited", notBefore, reason, NO_RATE);
    return { kind: "defer", notBefore, reason };
  }

  if (out.text.length === 0) return attention(VOICE_NOTHING_HEARD);
  // Both writes are idempotent (insert ... on conflict do nothing; the same count), so a rerun after a lost lease is harmless.
  // The page is plain text (ocr stays false) and carries no kind: it is not a statement page.
  await documents.insertPages(doc.id, [{ pageNo: 1, text: out.text }]);
  await documents.setPageCount(doc.id, 1);
  return { kind: "done", result: { chars: out.text.length, seconds: settledSeconds(out.seconds, reserved) } };
};
