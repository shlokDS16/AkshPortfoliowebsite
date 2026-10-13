import { TriangleAlert } from "lucide-react";
import type { LivenessState } from "@/modules/ops";

/** Red strip (segment 4): names what is late, says notes are safe and that Shlok was emailed. No dismiss. */
function AlertStrip({ state }: { state: Exclude<LivenessState, { status: "ok" }> }) {
  return (
    <div
      role="alert"
      data-testid="health-strip"
      className="relative z-(--z-strip) border-b-2 border-bad bg-bad-wash text-small text-ink desk:text-small-desk"
    >
      <p className="mx-auto flex max-w-page items-start gap-2 px-(--gutter) py-2">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-bad" />
        {state.status === "late" ? (
          <span>
            {state.problems.length > 0 ? (
              <>
                <strong className="font-semibold text-bad">Background jobs are late:</strong> {state.problems.join("; ")}.{" "}
                {/* One safe-sentence only: with a stuck queue its clause carries the reassurance. */}
                {state.queue ? null : "Your notes are safe; documents wait until the jobs run. "}
              </>
            ) : null}
            {state.queue ? (
              <>
                <strong className="font-semibold text-bad">{state.queue.split("; ")[0]};</strong> {state.queue.split("; ").slice(1).join("; ")}.{" "}
              </>
            ) : null}
            The uptime monitor has emailed Shlok and Aksh.
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-bad">The database cannot be reached right now.</strong> New captures stay saved on this device and sync
            when it is back.
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Things worth a look that are not failures (a tracked company with no row in a good file): a quiet line, never an alert, and
 * never a claim about the monitor. Private: nothing here is a public fact.
 */
function NoteStrip({ notes }: { notes: string[] }) {
  return (
    <p role="status" data-testid="health-note" className="border-b border-rule bg-surface text-small text-ink-muted desk:text-small-desk">
      <span className="mx-auto block max-w-page px-(--gutter) py-1.5">{notes.join(" ")}</span>
    </p>
  );
}

export function LivenessStrip({ state }: { state: LivenessState }) {
  const notes = state.status === "unreachable" ? [] : (state.notes ?? []);
  if (state.status === "ok" && notes.length === 0) return null;
  return (
    <>
      {state.status === "ok" ? null : <AlertStrip state={state} />}
      {notes.length > 0 ? <NoteStrip notes={notes} /> : null}
    </>
  );
}
