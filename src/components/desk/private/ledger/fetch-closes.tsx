"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ErrorCode } from "@/lib/messages";
import { FETCH_BUTTON, FETCH_INTRO, FETCH_PENDING, fetchStepText } from "@/lib/messages-closes";
import { FormError } from "./fields";
import { useSealedForm } from "./use-sealed-form";

export type FetchStep = { job: string; label: string; ok: boolean; detail: string };
export type FetchState = { error: ErrorCode | null; steps: FetchStep[] | null };

const IDLE: FetchState = { error: null, steps: null };

/**
 * "Fetch closes now": one button, then each step's own result in words. The button stays focusable while it runs
 * (aria-disabled, never disabled) and a second press is ignored here and again on the server (one run at a time).
 */
export function FetchCloses({ action }: { action: (previous: FetchState, data: FormData) => Promise<FetchState> }) {
  const { state, pending, ready, onSubmit } = useSealedForm<FetchState>(action, IDLE);
  return (
    <form method="post" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="space-y-3">
      <p className="max-w-[60ch] text-small text-ink-muted">{FETCH_INTRO}</p>
      <Button type="submit" disabled={!ready} aria-disabled={!ready || pending}>
        {pending ? FETCH_PENDING : FETCH_BUTTON}
      </Button>
      <FormError code={state.error} id="fetch-error" submitted={state} />
      {state.steps ? (
        <ul role="status" aria-label="Result of the fetch" className="space-y-1 text-small" data-testid="fetch-result">
          {state.steps.map((s) => {
            const Icon = s.ok ? Check : TriangleAlert;
            return (
              <li key={s.job} data-job={s.job} className="flex items-start gap-1.5 tabular-nums">
                <Icon aria-hidden strokeWidth={1.5} className={s.ok ? "mt-0.5 size-4 shrink-0 text-ink-muted" : "mt-0.5 size-4 shrink-0 text-warn"} />
                <span className={s.ok ? "text-ink-body" : "font-medium text-ink"}>{fetchStepText(s.label, s.ok, s.detail)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </form>
  );
}
