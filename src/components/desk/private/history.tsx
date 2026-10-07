import Link from "next/link";
import { diffRevisions, type Revision } from "@/modules/research";

type Props = { revisions: Revision[]; currentId: string | null; pendingIds: ReadonlySet<string>; from?: string; to?: string };

const LINE_STYLE = {
  add: "bg-ins",
  remove: "text-ink-muted line-through",
  equal: "",
} as const;
const LINE_MARK = { add: "+ ", remove: "- ", equal: "  " } as const;

/** Private history: every revision by its raw number (#n), drafts included; the public site shows gated ordinals (D11). */
export function History({ revisions, currentId, pendingIds, from, to }: Props) {
  if (revisions.length === 0) return null;
  const newer = revisions.find((r) => String(r.revNo) === to) ?? revisions[0];
  const older = revisions.find((r) => String(r.revNo) === from) ?? revisions.find((r) => r.revNo === newer.revNo - 1) ?? null;
  const lines = older ? diffRevisions(older.bodyMd, newer.bodyMd) : [];
  return (
    <section aria-labelledby="history-heading" className="space-y-3 rounded-sm border border-rule p-3">
      <h2 id="history-heading" className="text-subtitle text-ink">
        Revision history
      </h2>
      <ol className="space-y-1 text-small">
        {revisions.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-mono">#{r.revNo}</span>
            <span className="tabular-nums">{r.createdAt.slice(0, 10)}</span>
            <span className="text-ink-muted">{r.changeReason ?? "no reason given"}</span>
            {r.id === currentId ? <span className="font-semibold">current</span> : null}
            {pendingIds.has(r.id) ? <span className="font-semibold">waiting for the gate</span> : null}
            {r.revNo > 1 ? (
              <Link className="text-geru underline decoration-1 underline-offset-3" href={`?from=${r.revNo - 1}&to=${r.revNo}`}>
                diff
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {older ? (
        <div>
          <p className="mb-1 text-caption text-ink-muted">
            Changes from #{older.revNo} to #{newer.revNo}
          </p>
          <pre data-testid="diff" className="rounded-sm border border-rule bg-surface p-2 font-mono text-caption break-words whitespace-pre-wrap text-ink-body">
            {lines.map((line, index) => (
              <div key={index} data-op={line.op} className={`${LINE_STYLE[line.op]} indent-[-2ch] pl-[2ch]`}>
                {LINE_MARK[line.op]}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
