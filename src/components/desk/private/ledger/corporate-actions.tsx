import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ACTION_CORRECT_LINK, ACTION_SUPERSEDED_TEXT, ACTIONS_EMPTY, ACTIONS_INTRO, ACTIONS_MARK_NOTE } from "@/lib/messages-closes";
import type { ActionGroup, ActionLine } from "@/modules/ledger/client";

const WORDS = "whitespace-pre-wrap [overflow-wrap:anywhere] [unicode-bidi:isolate]";

function Row({ a, companyId }: { a: ActionLine; companyId: string }) {
  return (
    <li data-action={a.id} data-live={a.live ? "yes" : "no"} className="py-2 text-small tabular-nums desk:text-small-desk">
      <p className={a.live ? "text-ink" : "text-ink-muted"}>
        <span className="font-medium">{a.kindText}</span>, ex-date {formatDate(a.exDate)}, {a.factorText}
        {a.corrects ? <span className="text-ink-muted"> (corrects an earlier entry)</span> : null}
      </p>
      {a.note ? (
        <p className={`${WORDS} text-ink-body`} dir="auto" data-words>
          {a.note}
        </p>
      ) : null}
      <p className="text-caption text-ink-muted">
        Entered {formatDate(a.enteredOn)}.
        {a.live ? (
          <>
            {" "}
            <Link href={`/desk/ledger/closes?correct=${a.id}#action-form`} data-company={companyId} className="underline decoration-1 underline-offset-3">
              {ACTION_CORRECT_LINK}
            </Link>
          </>
        ) : (
          ` ${ACTION_SUPERSEDED_TEXT}.`
        )}
      </p>
    </li>
  );
}

/** The actions entered, by company: the ones in force first, the replaced ones below and marked as replaced. Append-only: only a correction link. */
export function CorporateActions({ groups }: { groups: ActionGroup[] }) {
  return (
    <div className="space-y-3">
      <p className="max-w-[62ch] text-small text-ink-muted">{ACTIONS_INTRO}</p>
      <p className="max-w-[62ch] text-small text-ink-body">{ACTIONS_MARK_NOTE}</p>
      {groups.length === 0 ? (
        <p className="text-small text-ink-body">{ACTIONS_EMPTY}</p>
      ) : (
        groups.map((g) => (
          <section key={g.companyId} aria-label={g.name} data-company={g.companyId} className="space-y-1">
            <h3 className="text-subtitle text-ink desk:text-subtitle-desk">
              {g.name}
              {g.symbol ? <span className="ml-3 font-mono text-mono-id font-normal text-ink-muted">{g.symbol}</span> : null}
            </h3>
            <ul className="divide-y divide-rule border-y border-rule">
              {g.live.map((a) => (
                <Row key={a.id} a={a} companyId={g.companyId} />
              ))}
              {g.replaced.map((a) => (
                <Row key={a.id} a={a} companyId={g.companyId} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
