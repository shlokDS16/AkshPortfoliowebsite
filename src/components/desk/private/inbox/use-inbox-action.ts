"use client";

import { useState, useTransition } from "react";
import { errorText } from "@/lib/messages";
import type { ActionResult } from "@/modules/ingestion/client";

/**
 * Runs one inbox button: disabled while it works, its failure text kept for the card. The server action revalidates
 * /desk/inbox, so a success needs nothing more here.
 */
export function useInboxAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(call: () => Promise<ActionResult>): Promise<void> {
    return new Promise((resolve) => {
      start(async () => {
        try {
          const result = await call();
          setError(result.ok ? null : result.message);
        } catch {
          setError(errorText("save-failed"));
        }
        resolve();
      });
    });
  }
  return { pending, error, run };
}
