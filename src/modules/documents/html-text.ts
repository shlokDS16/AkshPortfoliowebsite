// The visible text of a web page (Plan 2b Task 5, ruling R23: no HTML parser dependency). One linear scan, no regular
// expression over the whole page, so a hostile page cannot make it slow. Not a browser: it keeps what a reader would read.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  times: "×", deg: "°", plusmn: "±", euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§",
  laquo: "«", raquo: "»", frac12: "½", minus: "−", shy: "",
};

/** Elements whose content is never text: dropped with everything inside them. */
const RAW = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "canvas"]);
/** Elements that end a line. A table cell does not: its row reads as one line, cells a space apart. */
const BREAKS = new Set([
  "p", "div", "br", "hr", "tr", "li", "ul", "ol", "table", "section", "article", "header", "footer", "nav", "main", "aside", "blockquote",
  "pre", "h1", "h2", "h3", "h4", "h5", "h6", "dl", "dt", "dd", "form", "fieldset", "figure", "figcaption", "caption", "thead", "tbody", "tfoot", "address",
]);
const CELLS = new Set(["td", "th"]);

const isLetter = (c: string | undefined): boolean => c !== undefined && /[A-Za-z]/.test(c);

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,8});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const control = code < 32 && code !== 9 && code !== 10;
      const surrogate = code >= 0xd800 && code <= 0xdfff;
      return code === 0 || control || surrogate || code > 0x10ffff ? whole : String.fromCodePoint(code);
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

/** Index just past the `>` that ends the tag starting at `from`, or -1. A `>` inside a quoted attribute value does not end it. */
function tagEnd(html: string, from: number): number {
  let quote = "";
  for (let i = from; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i + 1;
  }
  return -1;
}

function tidy(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** `title` is the page's <title> (decoded, null when it has none); `text` is the visible text, one line per block or table row, no blank lines. */
export function htmlToText(html: string): { title: string | null; text: string } {
  // An ASCII-only fold keeps every index the same as in `html`: toLowerCase changes the length of some letters (U+0130 becomes two
  // code units), which would move the positions of </script and </style and let hidden text through.
  const lower = html.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  const out: string[] = [];
  let title: string | null = null;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out.push(decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) out.push(decodeEntities(html.slice(i, lt)));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) break; // an unclosed comment runs to the end of the page
      i = end + 3;
      continue;
    }
    const closing = html[i + 1] === "/";
    const nameAt = i + (closing ? 2 : 1);
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (!isLetter(html[nameAt])) {
      out.push("<"); // "1 < 2": a less-than sign, not a tag
      i += 1;
      continue;
    }
    let nameEnd = nameAt;
    while (nameEnd < html.length && /[A-Za-z0-9]/.test(html[nameEnd])) nameEnd += 1;
    const name = lower.slice(nameAt, nameEnd);
    const end = tagEnd(html, nameEnd);
    if (end === -1) break;
    i = end;
    if (closing) {
      if (BREAKS.has(name)) out.push("\n");
      else if (CELLS.has(name)) out.push(" ");
      continue;
    }
    if (name === "title") {
      const close = lower.indexOf("</title", i);
      const stop = close === -1 ? html.length : close;
      title ??= tidy(decodeEntities(html.slice(i, stop)).replace(/\n/g, " ")) || null;
      i = stop;
      continue;
    }
    if (RAW.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      if (close === -1) break; // an unclosed script swallows the rest of the page
      const after = tagEnd(html, close + 2);
      if (after === -1) break;
      i = after;
      continue;
    }
    if (BREAKS.has(name)) out.push("\n");
    else if (CELLS.has(name)) out.push(" ");
  }
  return { title, text: tidy(out.join("")) };
}
