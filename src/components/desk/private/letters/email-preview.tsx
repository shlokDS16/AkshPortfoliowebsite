type Props = { subject: string; preheader: string; html: string; text: string };

/**
 * The email as it will arrive (spec s8.1 step 3): the exact HTML in a frame with `sandbox=""`, which allows no script, no form, no navigation and no
 * same-origin access, so nothing in it can run or reach the desk. The plain-text part is shown as text. The subject and the one sentence are his
 * words, shown above it as the inbox will show them.
 */
export function EmailPreview({ subject, preheader, html, text }: Props) {
  return (
    <section aria-labelledby="preview-heading" className="space-y-3">
      <h2 id="preview-heading" className="text-subtitle text-ink">
        Preview
      </h2>
      <dl className="space-y-1 text-small">
        <div className="grid grid-cols-[5.5rem_1fr] gap-x-2">
          <dt className="text-ink-muted">Subject</dt>
          <dd className="break-words text-ink">{subject}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_1fr] gap-x-2">
          <dt className="text-ink-muted">Preview line</dt>
          <dd className="break-words text-ink">{preheader}</dd>
        </div>
      </dl>
      <iframe title="The email, as it will arrive" sandbox="" srcDoc={html} className="h-[32rem] w-full rounded-sm border border-rule bg-paper" />
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink underline decoration-1 underline-offset-3 desk:min-h-8">Plain text part</summary>
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-sm border border-rule p-3 font-mono text-mono-tag text-ink-body">{text}</pre>
      </details>
    </section>
  );
}
