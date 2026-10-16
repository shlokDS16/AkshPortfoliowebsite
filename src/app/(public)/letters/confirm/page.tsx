import type { Metadata } from "next";
import { SITE_POSITION } from "@/components/desk/disclosure";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { ConfirmForm } from "@/components/desk/reader-forms";
import { istDate } from "@/lib/dates";
import { LETTERS_COPY } from "@/modules/distribution/public";
import { buildSiteChrome, getSnapshot } from "@/modules/showcase";
import { confirmForm } from "../form-actions";

// Spec s8.5, s8.9: never cached, never indexed, and the address of this page (which holds the token) is not sent on as a referrer.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: LETTERS_COPY.confirmTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };

/** What a token can be: the same bound the action checks (letters/signup.ts). A longer or empty value is no link, so the page says "expired". */
const MAX_TOKEN = 128;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

/**
 * The link in the confirmation email (`/letters/confirm?t=<token>`). A GET only shows a button: mail scanners open links, and a scan must not
 * subscribe anyone. The button POSTs the token in a hidden field (not in an address) to confirmForm, which ends on `?r=confirmed` or `?r=expired`.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/letters/confirm">) {
  const query = await searchParams;
  const result = one(query.r);
  const token = one(query.t);
  const snapshot = await getSnapshot();
  const showForm = result === undefined && token !== undefined && token.length > 0 && token.length <= MAX_TOKEN;
  return (
    <PublicFrame current="letters" chrome={snapshot.status === "ok" ? buildSiteChrome(snapshot.data) : null} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">{LETTERS_COPY.confirmTitle}</h1>
      {showForm ? (
        <ConfirmForm action={confirmForm} token={token} />
      ) : (
        <p role="status" className="mt-4 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
          {result === "confirmed" ? LETTERS_COPY.confirmed : LETTERS_COPY.expired}
        </p>
      )}
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.status === "ok" ? snapshot.data.today : istDate(new Date())} />
    </PublicFrame>
  );
}
