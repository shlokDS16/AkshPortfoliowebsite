/** D12: shown only when `next build` ran without a database; at runtime ISR keeps the last good page instead. */
export function Unavailable({ heading = "Case files" }: { heading?: string }) {
  return (
    <div className="py-12">
      <h1 className="text-display text-ink desk:text-display-desk">{heading}</h1>
      <p className="prose-read mt-3 text-read text-ink-body desk:text-read-desk">
        The desk&apos;s records cannot be reached right now. The files return when the database is back. Nothing here is advice.
      </p>
    </div>
  );
}
