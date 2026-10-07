"use client";

import { Button } from "@/components/ui/button";

/** Shown only when no cached page exists yet and a read failed (spec s9). */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-read px-(--gutter) py-12">
      <h1 className="text-display text-ink desk:text-display-desk">This page could not load</h1>
      <p className="mt-3 text-read text-ink-body desk:text-read-desk">The desk&apos;s records did not answer. Nothing is lost; try again in a minute.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
