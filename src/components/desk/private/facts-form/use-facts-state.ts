"use client";

import { useMemo, useState } from "react";
import { latestFigureDate, parseFactsSheet, type SheetError } from "@/modules/casefile/client";
import { draftIds, draftToSheet, toDraft, type Draft } from "./draft";
import { brokenCitations, fieldErrors, rowErrors } from "./validate";

export type FactsMode = "form" | "text";

/**
 * One facts state for both modes. The text sheet is the only thing saved; the form is a view over it, converted with
 * casefile's parseFactsSheet / serializeFactsSheet. A switch that could lose typed input is refused and says why.
 */
export function useFactsState(sheet: string, bodyMd: string) {
  const [initial] = useState(() => {
    const parsed = parseFactsSheet(sheet);
    return parsed.errors.length === 0 ? { mode: "form" as FactsMode, draft: toDraft(parsed.caseFile) } : { mode: "text" as FactsMode, draft: null };
  });
  const [mode, setMode] = useState<FactsMode>(initial.mode);
  const [text, setText] = useState(sheet);
  const [draft, setDraft] = useState<Draft | null>(initial.draft);
  // The form's sheet when it opened: switching back with no change keeps Aksh's own text.
  const [origin, setOrigin] = useState(() => (initial.draft ? draftToSheet(initial.draft) : ""));
  // Every id the form has loaded: a new row never reuses one, even after its row was removed (see nextId).
  const [loaded, setLoaded] = useState(() => (initial.draft ? draftIds(initial.draft) : []));
  const [refusal, setRefusal] = useState<{ to: FactsMode; errors: SheetError[] } | null>(null);

  const formText = useMemo(() => (draft ? draftToSheet(draft) : ""), [draft]);
  const sheetText = mode === "form" ? formText : text;
  const parsed = useMemo(() => parseFactsSheet(sheetText), [sheetText]);
  const fields = useMemo(() => (mode === "form" && draft ? fieldErrors(draft) : {}), [mode, draft]);
  // A row's parser message repeats its field errors ("the value \"\" is not a number"), so it shows only once the fields are clean.
  const rows = useMemo(() => {
    const all = rowErrors(sheetText, parsed.errors);
    const flagged = new Set(Object.keys(fields).map((k) => k.split(".")[0]));
    return Object.fromEntries(Object.entries(all).filter(([key]) => !flagged.has(key)));
  }, [sheetText, parsed.errors, fields]);
  // In Text sheet mode the check runs whenever the text parses (an unparsed sheet cannot be saved anyway).
  const factKey = mode === "form" ? (draft?.facts.map((f) => f.id).join(",") ?? "") : parsed.errors.length === 0 ? parsed.caseFile.facts.map((f) => f.id).join(",") : null;
  const broken = useMemo(() => (factKey === null ? [] : brokenCitations(bodyMd, factKey.split(","))), [factKey, bodyMd]);
  const fieldCount = Object.keys(fields).length;

  function switchTo(next: FactsMode) {
    if (next === mode) return;
    if (next === "form") {
      if (parsed.errors.length > 0) return setRefusal({ to: "form", errors: parsed.errors });
      const fresh = toDraft(parsed.caseFile);
      setDraft(fresh);
      setLoaded((ids) => [...new Set([...ids, ...draftIds(fresh)])]);
      setOrigin(draftToSheet(fresh));
    } else {
      if (fieldCount > 0) return setRefusal({ to: "text", errors: [] });
      // Unchanged facts give back the sheet exactly as it was typed (comments, tabs, spacing); changed ones the canonical form.
      if (formText !== origin) setText(formText);
    }
    setRefusal(null);
    setMode(next);
  }

  return {
    mode,
    switchTo,
    refusal,
    text,
    setText: (value: string) => {
      setText(value);
      if (refusal?.to === "form") setRefusal(null);
    },
    loaded,
    draft,
    update: (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d)),
    sheetText,
    sheetErrors: parsed.errors,
    fields,
    rows,
    broken,
    fieldCount,
    blocking: parsed.errors.length > 0 || fieldCount > 0,
    latest: parsed.errors.length === 0 ? latestFigureDate(parsed.caseFile) : null,
  };
}

export type FactsState = ReturnType<typeof useFactsState>;
