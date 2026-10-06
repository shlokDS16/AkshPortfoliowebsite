/** publishing-rules "Wording guide for Aksh (shown in the editor)", verbatim. */
export function WordingGuide() {
  return (
    <details className="rounded-sm border border-rule p-3 text-small text-ink-body">
      <summary className="cursor-pointer text-ink">Wording guide</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Write &quot;what I expected and why&quot; rather than &quot;what you should do&quot;.</li>
        <li>Write &quot;the market priced X; I thought Y because Z&quot; instead of &quot;undervalued&quot;.</li>
        <li>Write the kill criteria: &quot;I would have been wrong if...&quot;.</li>
        <li>Prefer ranges and scenarios over point targets, and label them as inputs to a learning exercise.</li>
        <li>Mistakes are the most credible content on the site. Publish them.</li>
      </ul>
    </details>
  );
}
