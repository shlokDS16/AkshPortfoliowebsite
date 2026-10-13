import Link from "next/link";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/desk/private/ledger/event-form";
import { IdeaScoreBlock } from "@/components/desk/private/ledger/idea-score";
import { IdeaTimeline } from "@/components/desk/private/ledger/idea-timeline";
import { formatDate } from "@/lib/format";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { getIdeaPage } from "@/modules/ledger";
import { addIdeaEventAction } from "@/modules/ledger/actions";
import { sealedLineText } from "@/modules/ledger/client";

type Props = { params: Promise<{ ideaId: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

const STATUS = { open: "Open", closed: "Closed", void: "Withdrawn" } as const;

export default async function IdeaPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { ideaId } = await params;
  const { error, notice } = await searchParams;
  const page = await getIdeaPage(await createSupabaseServerClient(), ideaId);
  if (!page) notFound();
  const { idea, line } = page;
  const message = errorText(error);
  const noticeMessage = noticeText(notice);
  return (
    <article className="max-w-[56rem] space-y-8">
      <header className="space-y-1">
        <p className="text-small">
          <Link href="/desk/ledger" className="underline decoration-1 underline-offset-3">
            Ledger
          </Link>
        </p>
        <h1 className="text-display text-ink desk:text-display-desk">
          {line.name}
          {line.symbol ? <span className="ml-3 font-mono text-mono-id font-normal text-ink-muted">{line.symbol}</span> : null}
        </h1>
        <p className="text-small text-ink-body">
          {line.expectsText} · over {line.horizonText}, ending {formatDate(line.horizonEnds)}
          {line.pastHorizon ? " (past its horizon)" : ""} · {idea.held ? "you hold a position" : "you hold no position"}
        </p>
        <p className="text-small text-ink-muted tabular-nums">
          {STATUS[idea.status]}
          {line.closedOn ? ` on ${formatDate(line.closedOn)}${line.closeReasonText ? `: ${line.closeReasonText.toLowerCase()}` : ""}` : ""}
          {page.sealedAt ? ` · ${sealedLineText(page.sealedAt)}` : ""}
          {line.state === "waiting" && idea.status === "open" ? ` ${line.headline}` : ""}
        </p>
        <p className="flex flex-wrap gap-x-4 text-small">
          {idea.itemId ? (
            <Link href={`/desk/items/${idea.itemId}`} className="underline decoration-1 underline-offset-3">
              Open the company file
            </Link>
          ) : null}
          {page.allowed.length > 0 ? (
            <a href="#new-entry" className="underline decoration-1 underline-offset-3">
              Add to this idea
            </a>
          ) : null}
        </p>
      </header>
      {message ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {message}
        </p>
      ) : null}
      {noticeMessage ? <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">{noticeMessage}</p> : null}
      <IdeaScoreBlock line={line} score={page.score} />
      <IdeaTimeline events={page.events} />
      <section aria-labelledby="add-h" id="new-entry" className="space-y-3">
        <h2 id="add-h" className="text-title text-ink desk:text-title-desk">
          Add to this idea
        </h2>
        <EventForm key={page.events.length} ideaId={idea.id} allowed={page.allowed} voidUntil={page.voidUntil} action={addIdeaEventAction} />
      </section>
    </article>
  );
}
