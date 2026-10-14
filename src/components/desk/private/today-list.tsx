import Link from "next/link";
import { formatTime } from "@/lib/format";
import { filingErrorText, parseCapture, type TodayGroup } from "@/modules/capture";
import type { KnownTokenLists } from "@/modules/catalog";
import { CaptureText } from "./capture-text";
import { firstLink } from "./first-link";
import { toKnownTokens } from "./known-tokens";
import { ReadLinkButton } from "./read-link-button";

const KIND_WORD = { note: "private note", thesis: "thesis", learning: "learning note", process: "process note" } as const;

/** Today's captures grouped by company (spec s5), newest first; kind and time per row (segment 4 C). */
export function TodayList({ groups, known }: { groups: TodayGroup[]; known: KnownTokenLists }) {
  if (groups.length === 0) return null;
  const sets = toKnownTokens(known);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="font-mono text-mono-label uppercase text-ink-muted">{group.label}</h3>
          <ol className="divide-y divide-rule">
            {group.entries.map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-(--row-y)">
                <div>
                  <p className="whitespace-pre-wrap text-body text-ink">
                    {e.itemId ? (
                      <Link href={`/desk/items/${e.itemId}`} className="text-ink no-underline hover:underline">
                        <CaptureText raw={e.rawText} known={sets} />
                      </Link>
                    ) : (
                      <CaptureText raw={e.rawText} known={sets} />
                    )}
                  </p>
                  <p className="text-small text-ink-muted">
                    {KIND_WORD[parseCapture(e.rawText).kind]}
                    {e.parseError ? <span className="text-warn"> · {filingErrorText(e.parseError)}</span> : null}
                  </p>
                  <LinkAction raw={e.rawText} companyId={group.key === "none" ? null : group.key} />
                </div>
                <span className="text-small tabular-nums text-ink-muted">{formatTime(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** A capture with a link offers "Read this link": Aksh's click, never automatic (no surprise fetch or spend). */
function LinkAction({ raw, companyId }: { raw: string; companyId: string | null }) {
  const link = firstLink(raw);
  return link ? <ReadLinkButton url={link} companyId={companyId} /> : null;
}
