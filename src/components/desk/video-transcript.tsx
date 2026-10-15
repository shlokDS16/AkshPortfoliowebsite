import type { TranscriptLine } from "@/modules/showcase";

/** The fixed label (spec s15, pending approval). Read by a person who may take the text for his words: it says whose it is. */
export const TRANSCRIPT_LABEL = "Typed by machine from the video's captions and not edited. If it differs from the video, the video is the record.";

/**
 * The transcript, in the machine's face (spec s7.7). It is escaped text, one row per stored segment with the clock of its start; nothing is
 * re-worded or shortened. On screen it is a scrollable region so an hour of speech does not bury the page (focusable, so a keyboard can scroll
 * it); in print it runs whole, because the transcript prints.
 */
export function VideoTranscript({ lines }: { lines: TranscriptLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-(--section-gap)">
      <h2 id="transcript-heading" data-section className="text-title text-ink desk:text-title-desk">
        Transcript
      </h2>
      <p data-machine data-lint-exclude className="mt-1 max-w-(--measure) text-small text-ink-muted">
        {TRANSCRIPT_LABEL}
      </p>
      <div
        role="region"
        aria-labelledby="transcript-heading"
        tabIndex={0}
        className="mt-3 max-h-[32rem] overflow-y-auto border-y border-rule print:max-h-none print:overflow-visible"
      >
        <ol className="divide-y divide-rule">
          {lines.map((line) => (
            <li key={line.s} className="grid grid-cols-[4.25rem_1fr] gap-x-3 py-2">
              <span data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
                {line.clock}
              </span>
              <span className="max-w-(--measure) text-body text-ink-body">{line.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
