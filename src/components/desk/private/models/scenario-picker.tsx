"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/messages";
import { deleteValuationScenarioAction, saveValuationScenarioAction } from "@/modules/valuation/actions";
import type { ScenarioRow } from "@/modules/valuation/client";
import { FIX_INPUTS_FIRST, UNSAVED, WORKBOOK_VALUES } from "./copy";

// The scenario picker (spec s7.3): "Workbook values" first and read-only (it is never changed or deleted: an edit becomes unsaved
// changes), then his saved scenarios. "Save as scenario" stores the input values only, under his name and optional note; a saved one can
// be deleted, never edited (save under a new name). The workbook and the version are never overwritten.

export const WORKBOOK = "workbook";
export const DRAFT = "draft";

type Props = {
  versionId: string;
  scenarios: ScenarioRow[];
  /** "workbook", "draft" or a scenario id. */
  picked: string;
  values: Record<string, number>;
  disabled: boolean;
  /** An input box shows text that is not a number: saving would store a value other than the one shown. */
  saveBlocked: boolean;
  onPick: (id: string) => void;
  onSaved: (id: string) => void;
};

export function ScenarioPicker({ versionId, scenarios, picked, values, disabled, saveBlocked, onPick, onSaved }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = scenarios.find((s) => s.id === picked) ?? null;

  function run(call: () => Promise<{ ok: true } | { ok: false; message: string }>, after: () => void) {
    start(async () => {
      try {
        const result = await call();
        if (!result.ok) return setError(result.message);
        setError(null);
        after();
        router.refresh();
      } catch {
        setError(errorText("save-failed"));
      }
    });
  }

  function save(e: FormEvent) {
    e.preventDefault();
    run(
      async () => {
        const result = await saveValuationScenarioAction({ versionId, name: name.trim(), note: note.trim(), values });
        if (result.ok) onSaved(result.id);
        return result;
      },
      () => {
        setName("");
        setNote("");
      },
    );
  }

  return (
    <section aria-label="Scenarios" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 space-y-1 desk:max-w-sm">
          <span className="block text-label uppercase text-ink-muted">Scenario</span>
          <select
            value={picked}
            disabled={disabled}
            onChange={(e) => {
              setConfirming(false);
              onPick(e.target.value);
            }}
            className="min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink disabled:opacity-45"
          >
            <option value={WORKBOOK}>{WORKBOOK_VALUES}</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {picked === DRAFT ? <option value={DRAFT}>{UNSAVED}</option> : null}
          </select>
        </label>
        {current && !confirming ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
            Delete {current.name}
          </Button>
        ) : null}
      </div>
      {current?.note ? <p className="text-small text-ink-body desk:text-small-desk">{current.note}</p> : null}
      {current && confirming ? (
        <div role="group" aria-label="Delete this scenario" className="flex flex-wrap items-center gap-2 text-small text-ink">
          <span>Delete the scenario {current.name}? Its values go; the workbook stays as it is.</span>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => deleteValuationScenarioAction(current.id), () => onPick(WORKBOOK))}>
            Yes, delete it
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : null}
      <details className="rounded-sm border border-rule p-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-body font-medium text-ink">Save as scenario</summary>
        <form onSubmit={save} className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="block text-small text-ink-muted">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="off" />
          </label>
          <label className="block space-y-1">
            <span className="block text-small text-ink-muted">Note (optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
          </label>
          <p className="text-small text-ink-muted desk:text-small-desk">Saves the input values shown now. The workbook is not changed.</p>
          {saveBlocked ? <p className="text-small text-bad">{FIX_INPUTS_FIRST}</p> : null}
          <Button type="submit" disabled={pending || disabled || saveBlocked || name.trim() === ""}>
            Save
          </Button>
        </form>
      </details>
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
