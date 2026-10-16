import { longDate } from "./copy";

// The public entry of the sources module (spec s7): pure. The card a reader sees for each outside source of a company file, built from a row
// of the public_studied view. It imports no database, no cookie client and no desk module (the public side may import nothing else of
// this module). The view has already hidden a title, a name or a picture whose entry was not ticked or whose data changed (they come
// as null); this builder never invents one. No id is carried into a card.

/** A row of public.public_studied, in this module's camel case. `itemId` only groups rows by file and never reaches a card. */
export type PublicStudiedRow = {
  itemId: string;
  position: number;
  kind: "youtube" | "web";
  url: string;
  /** India calendar date (YYYY-MM-DD) the link was saved. */
  savedOn: string;
  /** His words for this source on this file, as the revision holds them. */
  note: string;
  title: string | null;
  siteName: string | null;
  channelUrl: string | null;
  thumbPath: string | null;
  thumbSha256: string | null;
};

export type StudiedCard = {
  position: number;
  kind: "youtube" | "web";
  url: string;
  /** The machine's title, only when the entry showed it; the page labels it with `titleLabel`. */
  title: string | null;
  titleLabel: "Title on YouTube" | "Title on the page" | null;
  /** "YouTube · {channel}", the site name, or, for a card without a title, "A video on YouTube" or the host. */
  origin: string;
  picture: { src: string; width: 320; height: 180 } | null;
  saved: string;
  note: string;
  linkLabel: "Watch on YouTube" | "Open the page";
};

const HASH = /^[0-9a-f]{64}$/;

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function cardOf(row: PublicStudiedRow): StudiedCard | null {
  const host = hostOf(row.url);
  if (host === null) return null;
  const shown = row.title !== null;
  const youtube = row.kind === "youtube";
  const origin = !shown
    ? youtube ? "A video on YouTube" : host
    : youtube ? (row.siteName ? `YouTube · ${row.siteName}` : "YouTube") : (row.siteName ?? host);
  return {
    position: row.position,
    kind: row.kind,
    url: row.url,
    title: row.title,
    titleLabel: shown ? (youtube ? "Title on YouTube" : "Title on the page") : null,
    origin,
    picture: shown && youtube && row.thumbSha256 !== null && HASH.test(row.thumbSha256) ? { src: `/media/studied/${row.thumbSha256}.jpg`, width: 320, height: 180 } : null,
    saved: `Saved ${longDate(row.savedOn)}`,
    note: row.note,
    linkLabel: youtube ? "Watch on YouTube" : "Open the page",
  };
}

/** The cards in the order he chose. A row whose address is not https is left out. */
export function buildStudiedCards(rows: readonly PublicStudiedRow[]): StudiedCard[] {
  return [...rows].sort((a, b) => a.position - b.position).flatMap((row) => cardOf(row) ?? []);
}

/** The cards of every file, by the file's id, each file's cards in order. */
export function studiedByItem(rows: readonly PublicStudiedRow[]): Map<string, StudiedCard[]> {
  const byItem = new Map<string, PublicStudiedRow[]>();
  for (const row of rows) byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), row]);
  return new Map([...byItem].map(([id, list]) => [id, buildStudiedCards(list)]));
}
