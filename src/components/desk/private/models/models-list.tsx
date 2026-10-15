import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { ModelListRow } from "@/modules/valuation";
import { STATUS_WORD } from "./copy";

// /desk/models (spec s7.1): each company's newest model version, its status and the day it was read. No desk tab: it is reached from the
// inbox card and the item page. On a phone each row is two lines.

export function ModelsList({ rows }: { rows: ModelListRow[] }) {
  return (
    <div className="space-y-4">
      <h1 className="text-display text-ink desk:text-display-desk">Models</h1>
      <p className="max-w-[72ch] text-small text-ink-muted desk:text-small-desk">Your valuation workbooks, newest version per company. Private: nothing here is published.</p>
      {rows.length === 0 ? (
        <p className="max-w-[72ch] rounded-sm border border-rule px-3 py-3 text-small text-ink desk:text-small-desk">
          No workbook has been read yet. Upload an .xlsx in the <Link href="/desk/inbox" className="text-geru underline decoration-1 underline-offset-3">Inbox</Link> with its
          company; each company&apos;s newest model will be listed here with its version, its status and the day it was read.
        </p>
      ) : (
        <table className="w-full border-collapse text-data desk:text-data-desk">
          <thead>
            <tr className="border-b border-rule-strong">
              {["Company", "Version", "Status", "Read"].map((h, i) => (
                <th key={h} scope="col" className={`px-(--cell-x) py-2 text-label uppercase text-ink-muted ${i === 1 || i === 3 ? "text-right" : "text-left"} ${i > 1 ? "max-md:hidden" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.versionId} className="border-b border-rule">
                <th scope="row" className="px-(--cell-x) py-(--row-y) text-left font-normal">
                  <Link href={`/desk/models/${r.versionId}`} className="text-ink underline decoration-1 underline-offset-3">
                    {r.company}
                  </Link>
                  <span className="block text-small text-ink-muted md:hidden">
                    {STATUS_WORD[r.status]}
                    {r.readAt ? ` · read ${formatDate(r.readAt)}` : ""}
                  </span>
                </th>
                <td className="px-(--cell-x) py-(--row-y) text-right tabular-nums text-ink">{r.versionNo}</td>
                <td className="px-(--cell-x) py-(--row-y) text-ink max-md:hidden">{STATUS_WORD[r.status]}</td>
                <td className="px-(--cell-x) py-(--row-y) text-right tabular-nums text-ink-muted max-md:hidden">{r.readAt ? formatDate(r.readAt) : "not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
