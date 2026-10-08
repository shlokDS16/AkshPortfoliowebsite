const LINK = /https:\/\/[^\s<>"'`]+/i;
const TRAILING = /[.,;:!?)\]}]+$/;
const MAX_CHARS = 2000;

/**
 * The first https link in a capture's words, or null. Trailing punctuation is not part of it ("see https://a.com/b." ends at "b").
 * Only https: the desk never opens anything else, and the server checks the link again before it asks for it.
 */
export function firstLink(raw: string): string | null {
  const found = LINK.exec(raw)?.[0].replace(TRAILING, "");
  if (!found || found.length > MAX_CHARS) return null;
  try {
    const url = new URL(found);
    return url.protocol === "https:" && url.hostname !== "" ? found : null;
  } catch {
    return null;
  }
}

/** The site's name for a label: "www.bseindia.com". */
export const hostOf = (link: string): string => new URL(link).hostname;
