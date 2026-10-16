import type { Metadata } from "next";
import { SITE_POSITION } from "@/components/desk/disclosure";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { LeaveForm } from "@/components/desk/reader-forms";
import { istDate } from "@/lib/dates";
import { LETTERS_COPY } from "@/modules/distribution/public";
import { buildSiteChrome, getSnapshot } from "@/modules/showcase";
import { leaveForm } from "../form-actions";

// Spec s8.5, s8.9: never cached and never indexed. It does not depend on the sign-up switch: a reader can always stop, even when sign-ups are closed
// and even when no letter is public.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: LETTERS_COPY.leaveTitle, robots: { index: false, follow: false } };

/** "Stop my letters": one field, one press, no sign-in. The answer on `?r=left` is the same sentence whether or not the address was on the list. */
export default async function LeavePage({ searchParams }: PageProps<"/letters/leave">) {
  const left = (await searchParams).r === "left";
  const snapshot = await getSnapshot();
  return (
    <PublicFrame current="letters" chrome={snapshot.status === "ok" ? buildSiteChrome(snapshot.data) : null} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">{LETTERS_COPY.leaveTitle}</h1>
      {left ? (
        <p role="status" className="mt-4 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
          {LETTERS_COPY.left}
        </p>
      ) : (
        <LeaveForm action={leaveForm} />
      )}
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.status === "ok" ? snapshot.data.today : istDate(new Date())} />
    </PublicFrame>
  );
}
