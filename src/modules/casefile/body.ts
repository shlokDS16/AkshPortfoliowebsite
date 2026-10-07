// The prose subset (D7): paragraphs, ## headings, - lists, [F1] chips. Rendered as React text, never HTML.
export const KILL_HEADING_RE = /^#{1,6}\s*what would prove me wrong\b.*$/im;

export type Inline = string | { chip: string };
export type ProseBlock = { kind: "p"; inline: Inline[] } | { kind: "h"; text: string } | { kind: "ul"; items: Inline[][] };
export type Condition = { id: string; text: string };

export function parseInline(text: string): Inline[] {
  return text
    .split(/(\[F\d{1,3}\])/)
    .filter((part) => part !== "")
    .map((part) => (/^\[F\d{1,3}\]$/.test(part) ? { chip: part.slice(1, -1) } : part));
}

/**
 * Aksh's text with the [F1] tokens taken out and nothing else changed (rule g). A token takes the space before it
 * along when what follows is a space, punctuation or the end ("FY26 [F1], up" reads "FY26, up"); inner spacing,
 * case and punctuation stay as he typed them. Only the outer ends are trimmed.
 */
export function inlineText(inline: Inline[]): string {
  let out = "";
  inline.forEach((part, i) => {
    if (typeof part === "string") {
      out += part;
      return;
    }
    let k = i + 1;
    while (k < inline.length && typeof inline[k] !== "string") k += 1;
    const after = k < inline.length ? (inline[k] as string) : "";
    if (after === "" || /^[\s.,;:!?)\]]/.test(after)) out = out.replace(/\s+$/, "");
  });
  return out.trim();
}

export function parseProse(md: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", inline: parseInline(para.join(" ")) });
    if (list.length) blocks.push({ kind: "ul", items: list.map(parseInline) });
    para = [];
    list = [];
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1].trim() });
    } else if (item) {
      if (para.length) flush();
      list.push(item[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** VIEW is everything above the heading Plan 1A's lint requires; conditions are "- T1: …" lines under it (D6). */
export function splitThesisBody(md: string): { viewMd: string; conditions: Condition[] } {
  const text = md.replace(/\r\n/g, "\n");
  const match = KILL_HEADING_RE.exec(text);
  if (!match) return { viewMd: text, conditions: [] };
  const after = text.slice(match.index + match[0].length);
  const end = after.search(/^#{1,6}\s/m);
  const testsMd = end >= 0 ? after.slice(0, end) : after;
  // Spaces and tabs only between the pieces: an empty "- T1:" must not swallow the next line.
  const conditions = [...testsMd.matchAll(/^[ \t]*[-*][ \t]*(T\d{1,2})[ \t]*[:.)]?[ \t]+(.+?)[ \t]*$/gm)].map((m) => ({ id: m[1], text: m[2] }));
  return { viewMd: text.slice(0, match.index).trimEnd(), conditions };
}
