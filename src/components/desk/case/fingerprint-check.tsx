"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Result = "idle" | "matches" | "differs" | "unsupported";
const SAY: Record<Exclude<Result, "idle">, string> = {
  matches: "Matches: the fingerprint before it and this text give this fingerprint.",
  differs: "Does not match.",
  unsupported: "This browser cannot run the check.",
};

/**
 * Spec s33.7: SHA-256 of (the fingerprint before it, one line break, the sealed text), in UTF-8, compared with the fingerprint
 * shown. Web Crypto in the reader's own browser; no network, nothing sent. It is the only client code on a case page.
 */
export function FingerprintCheck({ prevHash, canonical, hash }: { prevHash: string; canonical: string; hash: string }) {
  const [result, setResult] = useState<Result>("idle");

  async function run() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return setResult("unsupported");
    try {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(`${prevHash}\n${canonical}`));
      const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      setResult(hex === hash ? "matches" : "differs");
    } catch {
      setResult("unsupported");
    }
  }

  return (
    <div className="mt-3 font-sans">
      <button
        type="button"
        onClick={run}
        className="inline-flex min-h-11 items-center rounded-sm border border-ink px-4 text-body text-ink hover:bg-surface-2 active:scale-(--press-scale)"
      >
        Check in this browser
      </button>
      <p role="status" className={cn("mt-2 min-h-[1.5em] text-small desk:text-small-desk", result === "differs" || result === "unsupported" ? "text-bad" : "text-ink")}>
        {result === "idle" ? "" : SAY[result]}
      </p>
    </div>
  );
}
