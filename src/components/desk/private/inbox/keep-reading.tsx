"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { InboxActions } from "./types";

/** Pause between two slices while the last one found work (spec s8), and between two checks while documents only wait. */
export const SLICE_PAUSE_MS = 3_000;
export const IDLE_PAUSE_MS = 30_000;

type Props = {
  keepReading: InboxActions["keepReading"];
  /** True while any document is being read, waiting to start or paused: the tab keeps asking. */
  active: boolean;
};

/**
 * The inbox tab's own pump (plan E1). While the tab is visible it asks the server to read for a short slice, refreshes
 * the screen, waits and asks again as long as the last slice found work. Hidden tabs ask nothing; the 15-minute pump
 * still runs. Renders nothing.
 */
export function KeepReading({ keepReading, active }: Props) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let live = true;
    let running = false;
    let wake: (() => void) | null = null;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
        const timer = setTimeout(done, ms);
        wake = done;
      });

    async function loop() {
      if (running) return;
      running = true;
      try {
        while (live && document.visibilityState === "visible") {
          let more = false;
          try {
            more = (await keepReading()).more;
          } catch {
            more = false;
          }
          if (!live) return;
          router.refresh();
          await wait(more ? SLICE_PAUSE_MS : IDLE_PAUSE_MS);
        }
      } finally {
        running = false;
      }
    }
    // A tab that comes back to the front asks at once instead of waiting out its pause.
    const resume = () => {
      if (document.visibilityState !== "visible" || !live) return;
      if (wake) wake();
      else void loop();
    };
    document.addEventListener("visibilitychange", resume);
    void loop();
    return () => {
      live = false;
      wake?.();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [active, keepReading, router]);
  return null;
}
