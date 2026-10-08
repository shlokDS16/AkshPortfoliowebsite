import { WHISPER_BYTES_PER_SECOND, WHISPER_CAPS, WHISPER_MIN_BILLED_SECONDS } from "./caps";

// How many audio seconds a Whisper call reserves and how many it settles (ruling R8; spec s16.6, s16.9). Pure.

const positive = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The seconds to reserve before the call: the larger of the length the browser measured and a floor from the file's size
 * (a webm from MediaRecorder reports Infinity, and the browser's claim is only a claim), at least the 10 seconds Groq bills
 * for any request, and never more than the hour allowance, so reserve_units cannot raise for a long recording.
 */
export function reservationSeconds(bytes: number, claimedSeconds: unknown): number {
  const floor = Math.ceil(positive(bytes) / WHISPER_BYTES_PER_SECOND);
  const wanted = Math.max(WHISPER_MIN_BILLED_SECONDS, Math.ceil(positive(claimedSeconds)), floor);
  return Math.min(wanted, WHISPER_CAPS.secondsHour);
}

/**
 * The seconds to settle once the provider has answered: the length it reported (at least 10), or the reservation when its
 * answer carried none. Never below one second, so a settled call is counted as used.
 */
export function settledSeconds(reported: number | null, reserved: number): number {
  if (reported === null || !Number.isFinite(reported) || reported <= 0) return reserved;
  return Math.max(WHISPER_MIN_BILLED_SECONDS, Math.ceil(reported));
}
