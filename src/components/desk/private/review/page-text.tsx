import { normaliseText } from "@/modules/documents/client";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The words to mark for a printed label: the whole phrase first (so it wins where it is whole), then its longer words. */
export const wordsOf = (label: string): string[] => [label.trim(), ...label.split(/\s+/).filter((w) => w.length > 2)].filter((w, i, all) => w !== "" && all.indexOf(w) === i);

/** The line of the page that carries a label: the one that has the whole phrase, else the one with most of its words; null when none. */
export function pageLine(text: string, label: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const phrase = normaliseText(label);
  const whole = lines.find((l) => normaliseText(l).includes(phrase));
  if (whole) return whole;
  const words = wordsOf(label).slice(1).map(normaliseText);
  let best: { line: string; hits: number } | null = null;
  for (const line of lines) {
    const n = normaliseText(line);
    const hits = words.filter((w) => n.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { line, hits };
  }
  return best?.line ?? null;
}

/** Text with the given words marked (case-insensitive; a space in a phrase matches any run of spaces). */
export function Marked({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map((w) => escapeRe(w).replace(/\s+/g, "\\s+")).join("|")})`, "i"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-xs bg-warn-wash px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Props = { page: number; text: string | undefined; words: string[]; className?: string };

/** One page of the document as extracted, line breaks kept, with the words of the figure being checked marked. */
export function PageText({ page, text, words, className }: Props) {
  return (
    <section aria-label={`Text of page ${page}`} className={className}>
      <p className="mb-1 font-mono text-mono-label uppercase text-ink-muted">p. {page}</p>
      {text && text.trim() !== "" ? (
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-data text-ink-body tabular-nums">
          <Marked text={text} words={words} />
        </pre>
      ) : (
        <p className="text-small text-ink-muted">Page {page} has no text. It may be a scan; the original has it.</p>
      )}
    </section>
  );
}
