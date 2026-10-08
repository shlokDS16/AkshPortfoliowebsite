// Pasted text and a web page's text become pages of about 8,000 characters (Plan 2b Task 5, ruling R1). Pure and deterministic:
// the text_pages step recomputes the whole split on every run, so a repeated or resumed step writes the same pages.

/** Where to cut a window that is too long: the last blank line, else the last line break, else the last space, in its second half. */
function cutPoint(text: string, start: number, size: number): number {
  const window = text.slice(start, start + size);
  const half = Math.floor(size / 2);
  for (const separator of ["\n\n", "\n", " "]) {
    const at = window.lastIndexOf(separator);
    if (at >= half) return start + at + separator.length;
  }
  return start + size;
}

/**
 * Pages of at most `pageChars`, cut at a line break where one is near. A last page shorter than `minTail` is folded into the
 * one before it (so a page is never short enough to be taken for a scan: a page under 50 characters is a scan page).
 */
export function splitTextPages(raw: string, pageChars: number, minTail: number): string[] {
  const text = raw.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  const pages: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = text.length - start <= pageChars ? text.length : cutPoint(text, start, pageChars);
    const page = text.slice(start, end).trim();
    if (page !== "") pages.push(page);
    start = end;
  }
  const last = pages[pages.length - 1];
  if (pages.length > 1 && last.length < minTail) {
    pages.pop();
    pages[pages.length - 1] += `\n${last}`;
  }
  return pages;
}
