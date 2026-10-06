import Link from "next/link";
import type { ReadFirstNote } from "@/lib/view-types";

/** Optional context before a file (segment 2 borrowing from C); renders nothing when there is none. */
export function ReadFirst({ notes }: { notes: ReadFirstNote[] }) {
  if (notes.length === 0) return null;
  if (notes.length === 1) {
    const note = notes[0];
    return (
      <p className="text-small text-ink-muted desk:text-small-desk">
        Read first: <Link href={note.href}>{note.title}</Link> · {note.minutes} min
      </p>
    );
  }
  return (
    <div className="rounded-sm bg-surface p-3 text-small">
      <p className="text-label uppercase text-ink-muted">Read first</p>
      <ol className="mt-1 list-decimal pl-5">
        {notes.map((note) => (
          <li key={note.href}>
            <Link href={note.href}>{note.title}</Link> · {note.minutes} min
          </li>
        ))}
      </ol>
    </div>
  );
}
