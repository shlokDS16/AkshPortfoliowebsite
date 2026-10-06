/** Says what will appear, what it holds and why it is empty, and shows the column shape (design-dna 13.1). */
export function EmptyState({ title, body, shape }: { title?: string; body: string; shape: string[] }) {
  return (
    <div className="rounded-sm border border-dashed border-rule-strong p-4">
      {title ? <p className="text-subtitle text-ink desk:text-subtitle-desk">{title}</p> : null}
      <p className="max-w-[72ch] text-small text-ink-muted desk:text-small-desk">{body}</p>
      {shape.length > 0 ? (
        <p className="mt-2 text-label uppercase text-ink-muted">
          <span className="sr-only">Will show: </span>
          {shape.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
