import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { ITEM_GROUP_LABELS, type ConceptRef, type ConceptStatus } from "@/modules/knowledge/client";
import type { ConceptPageView } from "@/modules/knowledge";
import { PendingButton } from "../pending-button";
import { RelatedConcepts } from "./related-concepts";
import { SeenTogether } from "./seen-together";

const DESCRIPTION_MAX = 2000;
const STATUS_TEXT: Record<ConceptStatus, string> = {
  private: "Private",
  public: "Public: shown on the site once a published note or file uses it.",
  unchecked: "Not checked yet. Check it on Names.",
};

type Props = {
  view: ConceptPageView;
  /** Every screened concept, for the "Link a concept" picker. */
  screened: readonly ConceptRef[];
  makePublic: (formData: FormData) => Promise<void>;
  saveDescription: (formData: FormData) => Promise<void>;
  link: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
  unlink: (conceptA: string, conceptB: string, slug: string) => Promise<void>;
};

/** One concept: where it stands, what he means by it (his words, private), the notes that use it, his links and the desk's suggestions. */
export function ConceptPage({ view, screened, makePublic, saveDescription, link, unlink }: Props) {
  const { concept, groups, related, suggestions } = view;
  return (
    <article className="space-y-(--block-gap)">
      <header className="space-y-2">
        <h1 className="text-display text-ink desk:text-display-desk">{concept.name}</h1>
        <p className="text-small text-ink-muted">{STATUS_TEXT[concept.status]}</p>
        {concept.status === "private" ? (
          <form action={makePublic}>
            <PendingButton variant="outline">Make public</PendingButton>
          </form>
        ) : null}
        {concept.status === "unchecked" ? (
          <Link href="/desk/names" className="inline-flex min-h-11 items-center text-small text-ink underline decoration-1 underline-offset-3">
            Check it on Names
          </Link>
        ) : null}
      </header>
      <section aria-labelledby="words-h" className="space-y-2">
        <h2 id="words-h" className="text-title text-ink desk:text-title-desk">
          In your words
        </h2>
        <form action={saveDescription} className="space-y-2">
          <Label htmlFor="description">What you mean by {concept.name}</Label>
          <Textarea id="description" name="description" defaultValue={concept.descriptionMd ?? ""} maxLength={DESCRIPTION_MAX} aria-describedby="description-hint" />
          <p id="description-hint" className="text-caption text-ink-muted">
            Private. Only you see this.
          </p>
          <PendingButton variant="outline">Save</PendingButton>
        </form>
      </section>
      {groups.length === 0 ? <p className="text-small text-ink-muted">No note or file uses this concept yet.</p> : null}
      {groups.map(({ group, items }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="space-y-1">
          <h2 id={`group-${group}`} className="text-title text-ink desk:text-title-desk">
            {ITEM_GROUP_LABELS[group]}
          </h2>
          <ul className="divide-y divide-rule">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <span className="font-mono text-mono-tag tabular-nums text-ink-muted">{formatDate(item.createdAt)}</span>
                <Link href={`/desk/items/${item.id}`} className="min-w-0 break-words text-body text-ink underline decoration-1 underline-offset-3">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <RelatedConcepts conceptId={concept.id} slug={concept.slug} related={related} screened={screened} link={link} unlink={unlink} />
      <SeenTogether conceptId={concept.id} slug={concept.slug} suggestions={suggestions} link={link} />
    </article>
  );
}
