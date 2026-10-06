import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { formatDate } from "@/lib/format";
import type { SourceListItem } from "@/lib/view-types";
import { EmptyState } from "./empty-state";
import { IdMark } from "./id-mark";

/** Only http(s) becomes a link; anything else (javascript:, data:, malformed) is shown as plain text. */
function httpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function SourceList({ sources }: { sources: SourceListItem[] }) {
  if (sources.length === 0) {
    return <EmptyState body="No sources listed yet. Each source will show its type, document and filing date." shape={["No.", "Type", "Document", "Filed"]} />;
  }
  return (
    <ol className="space-y-2 text-small desk:text-small-desk">
      {sources.map((s) => {
        const href = httpUrl(s.url);
        return (
          <li key={s.id} className="grid grid-cols-[3rem_1fr] gap-x-2">
            <IdMark kind="source" value={s.id} />
            <span>
              <span className="text-ink-muted">{s.type} · </span>
              {href ? (
                <a href={href} rel="noopener noreferrer" target="_blank">
                  {s.doc} <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
                </a>
              ) : (
                s.doc
              )}
              {s.filedOn ? <span className="tabular-nums text-ink-muted"> · filed {formatDate(s.filedOn)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
