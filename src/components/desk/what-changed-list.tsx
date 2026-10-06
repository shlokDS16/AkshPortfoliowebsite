import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { WhatChangedEntry } from "@/lib/view-types";
import { EmptyState } from "./empty-state";
import { IdMark } from "./id-mark";

/** Segment 2's borrowing from B: the last five gated changes, reason first, then what moved. */
export function WhatChangedList({ entries }: { entries: WhatChangedEntry[] }) {
  return (
    <section aria-labelledby="what-changed">
      <h2 id="what-changed" className="text-title text-ink desk:text-title-desk">
        What changed <span className="text-small font-normal text-ink-muted">last 5 entries</span>
      </h2>
      <p className="text-small text-ink-muted">Reason first, then what moved.</p>
      {entries.length === 0 ? (
        <div className="mt-3">
          <EmptyState body="Nothing has changed yet. Each new file or revision will be listed here with its reason." shape={["Date", "File", "Reason", "What moved"]} />
        </div>
      ) : (
        <ol className="mt-3">
          {entries.map((e) => (
            <li key={`${e.on}-${e.subject.href}-${e.text}`} className="grid grid-cols-[6.5rem_1fr] gap-x-3 border-b border-rule py-(--row-y) text-body">
              <span className="text-small tabular-nums text-ink-muted">{formatDate(e.on)}</span>
              <div>
                <p>
                  {e.fileNo ? (
                    <>
                      <IdMark kind="file" value={e.fileNo} />{" "}
                    </>
                  ) : null}
                  <Link href={e.subject.href}>{e.subject.label}</Link>: {e.text}
                </p>
                <p className="text-small text-ink-muted">{e.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
