/** The keyboard-reachable value readout; the Table tab is always the full alternative (design-dna 14). */
export function ChartReadout({ text }: { text: string | null }) {
  return (
    <p aria-live="polite" className="mt-1 min-h-5 text-caption tabular-nums text-ink-muted">
      {text ?? "Focus the chart, then use the arrow keys to read each value."}
    </p>
  );
}
