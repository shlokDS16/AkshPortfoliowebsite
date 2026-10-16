import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { LetterIndex } from "@/components/desk/letter-index";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { SignupForm } from "@/components/desk/signup-form";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { issueFormTicket } from "@/lib/letters-form";
import { LETTERS_COPY } from "@/modules/distribution/public";
import { buildSiteChrome, getLettersOpen, getSnapshot, jsonLdFor, listLetterSummaries, pageMetadata } from "@/modules/showcase";
import { askForm } from "./form-actions";

// The sign-up form carries a ticket made at render time (the action refuses a post under 3 seconds old), so this page is rendered for every
// request. The snapshot and the switch it reads are cached as ever.
export const dynamic = "force-dynamic";
export const metadata = pageMetadata("letters", null);

/**
 * Spec s8.9: a 404 unless sign-ups are open or a letter is public, so merging this changes nothing a visitor can see (the deploy state). When open, the
 * notice and the form come first; the archive follows, newest first. Nothing here reads a reader, an address or a send.
 */
export default async function LettersPage({ searchParams }: PageProps<"/letters">) {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="letters" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Letters" />
      </PublicFrame>
    );
  }
  const letters = listLetterSummaries(snapshot.data);
  const open = await getLettersOpen();
  if (!open && letters.length === 0) notFound();
  const asked = (await searchParams).asked === "1";
  return (
    <PublicFrame current="letters" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">{LETTERS_COPY.archiveTitle}</h1>
      <p className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">{LETTERS_COPY.archiveIntro}</p>
      {open ? (
        <section id="subscribe" aria-labelledby="subscribe-heading" className="mt-(--block-gap) scroll-mt-20 print:hidden">
          <h2 id="subscribe-heading" data-section className="text-title text-ink desk:text-title-desk">
            {LETTERS_COPY.signupTitle}
          </h2>
          {asked ? (
            <p role="status" className="mt-3 max-w-(--measure) text-body text-ink">
              {LETTERS_COPY.asked}
            </p>
          ) : (
            <SignupForm action={askForm} ticket={issueFormTicket()} />
          )}
        </section>
      ) : null}
      <div className="mt-(--section-gap)">
        <LetterIndex letters={letters} />
      </div>
      <p className="mt-(--block-gap) print:hidden">
        <Link href="/letters/leave">{LETTERS_COPY.stopLink}</Link>
      </p>
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("letters", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
