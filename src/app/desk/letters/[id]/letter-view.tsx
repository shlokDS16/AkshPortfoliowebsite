import { EmailPreview } from "@/components/desk/private/letters/email-preview";
import { Flash } from "@/components/desk/private/letters/flash";
import { LetterFields } from "@/components/desk/private/letters/letter-fields";
import { LettersNav } from "@/components/desk/private/letters/letters-nav";
import { SendBlock } from "@/components/desk/private/letters/send-block";
import { GateDecisionPanel } from "@/components/desk/private/gate-decision";
import { PublishChecklist } from "@/components/desk/private/publish-checklist";
import { istDate } from "@/lib/dates";
import { saveLetterAction, approveSendAction, cancelSendAction, sendTestCopyAction } from "@/modules/distribution/actions";
import { publishCheckedAction, unpublishItemAction } from "@/modules/compliance/actions";
import type { LetterPage } from "./load";

type Query = { error?: string; notice?: string };

/**
 * /desk/letters/[id] (spec s8.1): his fields, the email exactly as it will arrive, the publishing gate with the rule 13 rows, and the send block.
 * On a phone the order is the order of the work (write, read, publish, send); on a wide screen the gate and the send block sit in a rail on the right.
 */
export function LetterView({ page, query }: { page: LetterPage; query: Query }) {
  const { data, screen, mail } = page;
  const { item, latest, current, pending, candidate, preview, decision, decisionRevNo } = data;
  const isPublic = item.visibility === "public";
  const cancelId = screen.state.control === "cancel" ? (screen.state.send?.id ?? null) : null;
  const revisionId = screen.approveRevisionId;
  return (
    <article className="space-y-(--block-gap)">
      <header className="space-y-1">
        <h1 className="break-words text-display text-ink desk:text-display-desk">{item.title}</h1>
        <p className="text-small text-ink-muted">
          letter · <span data-testid="visibility">{isPublic ? "Public" : "Private"}</span>
          {current ? ` · current revision #${current.revNo}` : ""}
        </p>
      </header>
      <LettersNav current="letter" />
      <Flash error={query.error} notice={query.notice} />
      {isPublic && pending.length > 0 ? (
        <p data-testid="pending-gate" className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
          {pending.length} {pending.length === 1 ? "revision is" : "revisions are"} waiting for the publishing gate. The archive still shows revision #{current?.revNo}.
        </p>
      ) : null}
      <div className="grid gap-(--block-gap) desk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-(--block-gap)">
          <LetterFields
            action={saveLetterAction.bind(null, item.id)}
            subject={item.title}
            objective={item.learningObjective ?? ""}
            note={latest?.bodyMd ?? ""}
            subjectIsLabel={screen.subjectIsLabel}
            mode={screen.mode}
          />
          <EmailPreview subject={item.title} preheader={item.learningObjective ?? ""} html={mail.html} text={mail.text} />
        </div>
        <aside id="gate" tabIndex={-1} className="min-w-0 space-y-(--block-gap) desk:sticky desk:top-[calc(var(--top-bar-h)+16px)] desk:self-start">
          <div className="space-y-4">
            <PublishChecklist
              items={preview ? [...preview.items, ...screen.checks] : []}
              rule4Needed={preview?.rule4Needed ?? false}
              companyName={null}
              companyAction={null}
              publishAction={candidate ? publishCheckedAction.bind(null, item.id, candidate.id) : null}
              publishLabel={candidate ? `Run the publishing gate on revision #${candidate.revNo}` : ""}
              figureReminder={false}
              live={isPublic && current ? { revNo: current.revNo, unpublish: unpublishItemAction.bind(null, item.id), dataAsOf: item.dataAsOf, today: istDate(new Date()) } : null}
            />
            <GateDecisionPanel itemId={item.id} decision={decision} decisionRevNo={decisionRevNo} latestId={latest?.id ?? null} />
          </div>
          <SendBlock
            state={screen.state}
            subject={item.title}
            confirmed={page.confirmed}
            approve={revisionId ? approveSendAction.bind(null, item.id, revisionId) : null}
            cancel={cancelId ? cancelSendAction.bind(null, cancelId, item.id) : null}
            testCopy={screen.canTestCopy && revisionId ? sendTestCopyAction.bind(null, item.id, revisionId) : null}
            testLine={screen.testLine}
          />
        </aside>
      </div>
    </article>
  );
}
