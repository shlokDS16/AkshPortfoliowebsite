import { audioMimeOfPath, VOICE_MAX_BYTES } from "@/modules/documents";
import { SHORT_WAIT_MS, WHISPER_BUCKET, WHISPER_CAPS } from "../caps";
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
const MINUTE_WAIT_SECONDS = 60;
/** A retry-after over this many seconds is the hour allowance; over an hour it is the day's. */
const HOUR_AFTER_SECONDS = 600;
const DAY_AFTER_SECONDS = 3_600;
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
    return { result, spent: result.kind === "ok" ? settledSeconds(result.seconds, reserved) : false };
  });
  if (budget.kind === "deferred") return { kind: "defer", notBefore: budget.notBefore, reason: budget.reason };

  const out = budget.result;
  if (out.kind === "provider_error") return { kind: "retry", failure: "provider", error: out.message.slice(0, 400) };
  if (out.kind === "rate_limited") {
    const wait = Math.max(out.retryAfterSeconds ?? MINUTE_WAIT_SECONDS, 1);
    const reason = wait > DAY_AFTER_SECONDS ? "voice_day" : wait > HOUR_AFTER_SECONDS ? "voice_hour" : "groq_minute";
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
