import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/utils";
import type { StudiedCard } from "@/modules/showcase";
import { BlockHeader } from "./block-header";
import { Machine } from "./case/case-entry";

export const STUDIED_TITLE = "Other people's work I studied";
export const STUDIED_SUB = "Videos, articles and letters by others, with my note on each. Linked, not endorsed.";
/** A fixed phrase, not the video's: the desk reads no picture, so no sentence about what it shows is made up here. */
export const PICTURE_ALT = "Thumbnail of the video";

function Card({ card }: { card: StudiedCard }) {
  const { picture } = card;
  return (
    <li className={cn("grid gap-x-6 gap-y-3 border-b border-rule py-(--block-gap) first:pt-0 last:border-b-0 last:pb-0", picture && "desk:grid-cols-[320px_1fr]")}>
      {picture ? (
        <div data-studied-picture className="print:hidden">
          {/* Our own /media/studied route, never a third party's address; next/image would route it through the optimiser for no gain. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picture.src} width={picture.width} height={picture.height} alt={PICTURE_ALT} loading="lazy" decoding="async" className="block aspect-video h-auto w-full max-w-80 border border-rule bg-surface-2 object-cover" />
        </div>
      ) : null}
      <div className="min-w-0 space-y-3">
        <Machine className="space-y-1">
          {card.titleLabel ? <p className="font-mono text-mono-label uppercase">{card.titleLabel}</p> : null}
          {card.title ? <p className="break-words text-data text-ink desk:text-data-desk">{card.title}</p> : null}
          <p>
            <span>{card.origin}</span> · <span>{card.saved}</span>
          </p>
        </Machine>
        {card.note ? (
          <div>
            <p className="font-mono text-mono-label uppercase text-geru">My note</p>
            <p className="prose-read mt-1 whitespace-pre-wrap break-words text-read text-ink-body desk:text-read-desk">{card.note}</p>
          </div>
        ) : null}
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          referrerPolicy="no-referrer"
          className="inline-flex min-h-11 items-center text-body text-ink underline decoration-1 underline-offset-3 desk:min-h-8"
        >
          {card.linkLabel}
          <VisuallyHidden>
            {card.title ? `: ${card.title}` : ""} (opens in a new tab)
          </VisuallyHidden>
        </a>
      </div>
    </li>
  );
}

/**
 * The file page's block of other people's work (spec s7): a title the machine read, in the machine's face and labelled as theirs; his note under
 * "My note" in the reading face; a link. Absent when the file lists none. A card the entry did not show is plain (no title, no picture).
 */
export function StudiedBlock({ cards }: { cards: StudiedCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="studied">
      <BlockHeader label="STUDIED" id="studied" title={STUDIED_TITLE} sub={STUDIED_SUB} />
      <ul>
        {cards.map((card) => (
          <Card key={card.position} card={card} />
        ))}
      </ul>
    </section>
  );
}
