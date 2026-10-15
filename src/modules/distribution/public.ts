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
