import Link from "next/link";
import { Machine } from "@/components/desk/case/case-entry";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { istDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SourceActionState } from "@/modules/sources/actions";
import { longDate, type SourceRecord } from "@/modules/sources/client";
import type { AttachOption } from "./attach-picker";
import { SourceActions, type ActionsProps } from "./source-actions";
import { SourceEdit } from "./source-edit";
import { sourceStatus } from "./status";

export type Attached = AttachOption & { slug: string };
export type CardModel = { record: SourceRecord; companies: Attached[]; concepts: Attached[]; publicFiles: { itemId: string; title: string }[] };
export type CardActions = ActionsProps["actions"] & { update: (formData: FormData) => Promise<SourceActionState> };
type Props = { model: CardModel; actions: CardActions; companies: readonly AttachOption[]; concepts: readonly AttachOption[] };

const chip = "inline-flex min-h-11 items-center rounded-sm border border-rule-strong px-3 text-small text-ink no-underline hover:border-ink desk:min-h-8";

/** The saved address as a person would say it: host and path, no scheme, no query. */
function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * One saved source (spec s6.5). The machine's data (title, channel or site, the date it was read) sits in the machine face and says whose it is;
 * his note is in the reading face apart from it. The status is a sentence, never a code.
 */
export function SourceCard({ model, actions, companies, concepts }: Props) {
  const { record: r } = model;
  const status = sourceStatus(r, model.publicFiles.length > 0);
  const read = r.fetchedAt !== null && r.title !== null;
  const readOn = read ? longDate(istDate(r.metaSince ?? r.fetchedAt!)) : null;
  return (
    <li className="grid gap-x-4 gap-y-3 py-(--block-gap) first:pt-0 desk:grid-cols-[auto_1fr]">
      {r.thumbPath ? (
        // Our own admin-only route: the browser never contacts the picture's origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/desk/sources/${r.id}/thumb`} width={160} height={90} alt="Thumbnail of the video" loading="lazy" className="aspect-video h-auto w-40 max-w-full border border-rule bg-surface-2 object-cover" />
      ) : null}
      <div className={cn("min-w-0 space-y-3", !r.thumbPath && "desk:col-span-2")}>
        <Machine className="space-y-1">
          {readOn ? <p className="font-mono text-mono-label uppercase tabular-nums text-geru">{r.kind === "youtube" ? "From YouTube" : "From the page"}, read {readOn}</p> : null}
          {r.title ? <p className="break-words text-data text-ink desk:text-data-desk">{r.title}</p> : null}
          {r.siteName ? <p className="break-words">{r.siteName}</p> : null}
          <p className="break-all">
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-ink-muted underline decoration-1 underline-offset-3 desk:min-h-8">
              {shortLink(r.url)}
              <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
            </a>
          </p>
        </Machine>
        <p className="text-small text-ink">
          <span className="font-semibold">{status.visibility}</span>
          {model.publicFiles.map((f) => (
            <span key={f.itemId}>
              {" · "}
              <Link href={`/desk/items/${f.itemId}`} className="underline decoration-1 underline-offset-3">
                {f.title}
              </Link>
            </span>
          ))}
        </p>
        {status.detail ? (
          <p className={cn("rounded-sm border px-3 py-2 text-small text-ink", status.detail.tone === "warn" ? "border-warn bg-warn-wash" : "border-rule")}>{status.detail.text}</p>
        ) : null}
        {r.note ? (
          <div>
            <p className="font-mono text-mono-label uppercase text-geru">My note</p>
            <p className="prose-read mt-1 whitespace-pre-wrap break-words text-read text-ink-body desk:text-read-desk">{r.note}</p>
          </div>
        ) : null}
        {model.companies.length + model.concepts.length > 0 ? (
          <ul aria-label="Attached to" className="flex flex-wrap gap-2">
            {model.companies.map((c) => (
              <li key={c.id}>
                <Link href={`/desk/sources?company=${c.slug}`} className={chip}>
                  {c.hint ? `$${c.hint}` : c.label}
                </Link>
              </li>
            ))}
            {model.concepts.map((c) => (
              <li key={c.id}>
                <Link href={`/desk/sources?concept=${c.slug}`} className={chip}>
                  #{c.slug}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <SourceActions archived={r.archivedAt !== null} actions={actions} />
        {r.archivedAt === null ? <SourceEdit note={r.note} action={actions.update} companies={companies} concepts={concepts} attached={{ companyIds: r.companyIds, themeIds: r.themeIds }} /> : null}
      </div>
    </li>
  );
}
