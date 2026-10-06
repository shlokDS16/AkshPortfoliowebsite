import Link from "next/link";
import { diffRevisions, type Revision } from "@/modules/research";

type Props = { revisions: Revision[]; currentId: string | null; pendingIds: ReadonlySet<string>; from?: string; to?: string };

const LINE_STYLE = {
  add: "bg-green-100 dark:bg-green-950",
  remove: "bg-red-100 line-through dark:bg-red-950",
  equal: "",
} as const;
const LINE_MARK = { add: "+ ", remove: "- ", equal: "  " } as const;

export function History({ revisions, currentId, pendingIds, from, to }: Props) {
  if (revisions.length === 0) return null;
  const newer = revisions.find((r) => String(r.revNo) === to) ?? revisions[0];
  const older = revisions.find((r) => String(r.revNo) === from) ?? revisions.find((r) => r.revNo === newer.revNo - 1) ?? null;
  const lines = older ? diffRevisions(older.bodyMd, newer.bodyMd) : [];
  return (
    <section className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Revision history</h2>
      <ol className="space-y-1 text-sm">
        {revisions.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-mono">#{r.revNo}</span>
            <span>{r.createdAt.slice(0, 10)}</span>
            <span className="text-muted-foreground">{r.changeReason ?? "no reason given"}</span>
            {r.id === currentId ? <span className="font-medium">current</span> : null}
            {pendingIds.has(r.id) ? <span className="font-medium">waiting for the gate</span> : null}
            {r.revNo > 1 ? (
              <Link className="underline" href={`?from=${r.revNo - 1}&to=${r.revNo}`}>
                diff
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {older ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Changes from #{older.revNo} to #{newer.revNo}
          </p>
          <pre data-testid="diff" className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {lines.map((line, index) => (
              <div key={index} data-op={line.op} className={LINE_STYLE[line.op]}>
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
