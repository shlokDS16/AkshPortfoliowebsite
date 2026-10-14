import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { LivenessState } from "@/modules/ops";
import { DeskTabs } from "./desk-tabs";
import { LivenessStrip } from "./liveness-strip";
import { OfflineStrip } from "./offline-strip";

type Props = { names: number; inbox: number; liveness: LivenessState; signOut: () => Promise<void>; capture?: ReactNode; children: ReactNode };

/** Private chrome (design-dna 8.4): "Desk" + mono "private", tabs, strips. Never indexed. */
export function DeskShell({ names, inbox, liveness, signOut, capture, children }: Props) {
  return (
    <>
      <header className="sticky top-0 z-(--z-top-bar) h-(--top-bar-h) border-b border-rule bg-paper">
        <div className="mx-auto flex h-full max-w-page items-center gap-3 px-(--gutter)">
          <Link href="/desk" className="inline-flex min-h-11 items-center font-semibold text-ink no-underline">
            Desk
          </Link>
          <span className="rounded-sm border border-rule-strong px-1 font-mono text-mono-label uppercase text-ink-muted">private</span>
          <DeskTabs names={names} inbox={inbox} variant="top" />
          <div className="flex-1" />
          {capture}
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <LivenessStrip state={liveness} />
      <OfflineStrip />
      <main id="main" className="mx-auto max-w-page px-(--gutter) pt-6 pb-[calc(var(--tab-bar-h)+6rem)] desk:pb-12">
        {children}
      </main>
      <DeskTabs names={names} inbox={inbox} variant="bottom" />
    </>
  );
}
