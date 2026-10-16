// Pure renderers for a listed video (Phase 5b, spec s7.7). The ONLY file of this module the public side may import: no server-only,
// no database, no node API, no env. Addresses are built from an id that is checked here, so a stored value that is not a YouTube id
// can never become part of an address. Nothing re-words anything: the transcript text is joined, never changed.
/** Structurally the same as the stored segment type of ./videos/types: restated here so this file reaches nothing else of the module (the public boundary). */
type Segment = { s: number; t: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** A plain `img` source on YouTube's image host; the page loads nothing else from YouTube before the press (D79). */
export function thumbnailUrl(youtubeId: string): string | null {
  return VIDEO_ID.test(youtubeId) ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

/** The privacy-enhanced embed. With a start second the iframe is reloaded at that second, playing (a chapter link). */
export function embedUrl(youtubeId: string, startSeconds?: number): string | null {
  if (!VIDEO_ID.test(youtubeId)) return null;
  const base = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
  return startSeconds !== undefined && Number.isInteger(startSeconds) && startSeconds >= 0 ? `${base}?start=${startSeconds}&autoplay=1` : base;
}

/** `m:ss`, or `h:mm:ss` from one hour; a negative or fractional number is floored at zero. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** ISO 8601 duration for `VideoObject.duration`, in hours, minutes and seconds only (`PT1H2M3S`). */
export function isoDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h > 0 ? `${h}H` : ""}${m > 0 ? `${m}M` : ""}${s > 0 || total === 0 ? `${s}S` : ""}`;
}

/** The transcript as one text for `VideoObject.transcript`: the segment texts joined by a space, each exactly as stored. */
export function transcriptPlainText(segments: readonly Segment[]): string {
  return segments.map((s) => s.t).join(" ");
}

/** An ordinary link to a moment of the video on youtube.com: what a chapter link does when the page's script has not run. Loads nothing. */
export function watchUrl(youtubeId: string, startSeconds?: number): string | null {
  if (!VIDEO_ID.test(youtubeId)) return null;
  const base = `https://www.youtube.com/watch?v=${youtubeId}`;
  return startSeconds !== undefined && Number.isInteger(startSeconds) && startSeconds >= 0 ? `${base}&t=${startSeconds}s` : base;
}

// ---- Letters (Phase 5c, spec s15): the words a reader sees on /letters, /letters/confirm and /letters/leave. Pure strings, so the public
// ---- pages can import them from here. Every string is pending Shlok's approval. The actions that use them are in public-actions.ts.

/** Must equal private.letters_notice_version() (migration 0024); letters/notice.test.ts reads the migration and compares. */
export const LETTERS_NOTICE_VERSION = "letters-2026-10-v1";
export const LETTERS_NOTICE =
  "Get an email when Aksh publishes a letter about what changed on this site. We keep only your email address, and only to send these letters. It is sent through Resend, an email service in the United States. You can stop at any time with the link in every letter or on this page; we then delete your address. You must be 18 or older.";
export const LETTERS_COPY = {
  emailLabel: "Email",
  adultLabel: "I am 18 or older",
  ask: "Ask to subscribe",
  /** The answer to every request, whether or not it was kept (no address enumeration). */
  asked: "Thanks. Aksh sends confirmation emails by hand, usually within a day. Open the link in it to start receiving letters.",
  confirmTitle: "Confirm your subscription",
  confirmButton: "Yes, send me the letters",
  confirmed: "You will get the next letter.",
  expired: "This link has expired. Ask again on the letters page.",
  leaveTitle: "Stop my letters",
  leaveButton: "Stop",
  left: "Done. If a letter was already on its way, it may still arrive.",
  empty: "No letters yet.",
  sentLine: (date: string) => `Sent to subscribers on ${date}.`,
} as const;
