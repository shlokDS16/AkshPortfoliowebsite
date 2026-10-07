"use client";

import { Button } from "@/components/ui/button";

/** A desk page failed to render. Renders inside the desk shell's <main>; never shows the error's detail (M2). */
export default function DeskError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section aria-labelledby="desk-error" className="max-w-read py-12">
      <h1 id="desk-error" className="text-display text-ink desk:text-display-desk">
        This page could not load
      </h1>
      <p className="mt-3 text-read text-ink-body desk:text-read-desk">The desk&apos;s records did not answer. Nothing you saved is lost; try again in a minute.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
