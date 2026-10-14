/** Where a saved figure was read and whether Aksh changed it. Private desk only: the public page has no machine provenance in 2a. */
export function ProvenanceChip({ text }: { text: string }) {
  return (
    <p data-testid="provenance-chip" className="inline-flex max-w-full self-start break-words rounded-sm border border-rule bg-surface px-2 py-0.5 text-caption text-ink-muted">
      {text}
    </p>
  );
}
