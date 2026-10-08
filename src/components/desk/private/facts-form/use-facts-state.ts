"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { latestFigureDate, parseFactsSheet, type SheetError } from "@/modules/casefile/client";
import type { StagedRow } from "@/modules/ingestion/client";
import { ADD_SOURCE_EVENT, type AddSourceDetail } from "../add-source-event";
import { checkableFromCaseFile, checkableFromDraft } from "./checkable";
import { blankSource, draftIds, draftToSheet, nextId, toDraft, type Draft } from "./draft";
import { mergeStaged } from "./staged";
import { brokenCitations, citedFacts, fieldErrors, rowErrors } from "./validate";

export type FactsMode = "form" | "text";

/**
 * One facts state for both modes. The text sheet is the only thing saved; the form is a view over it, converted with
 * casefile's parseFactsSheet / serializeFactsSheet. A switch that could lose typed input is refused and says why.
 */
export function useFactsState(sheet: string, bodyMd: string, staged: StagedRow[] = [], provenanceIds: string[] = []) {
  // The staged figures are merged once, as the form opens (ADR-004 s4.7): after that they are rows like any other.
  const [initial] = useState(() => {
    const parsed = parseFactsSheet(sheet);
    if (parsed.errors.length > 0) return { mode: "text" as FactsMode, draft: null, unmerged: null, merged: null };
    const unmerged = toDraft(parsed.caseFile);
    const merged = staged.length > 0 ? mergeStaged(unmerged, staged, [...citedFacts(bodyMd), ...provenanceIds]) : null;
    return { mode: "form" as FactsMode, draft: merged?.draft ?? unmerged, unmerged, merged };
  });
  const [mode, setMode] = useState<FactsMode>(initial.mode);
  const [text, setText] = useState(sheet);
  const [draft, setDraft] = useState<Draft | null>(initial.draft);
  // The form's sheet when it opened, before any staged row was merged in (R6): switching to Text sheet with no edit then
  // shows the merged rows, and switching back with no change keeps Aksh's own text.
  const [origin, setOrigin] = useState(() => (initial.unmerged ? draftToSheet(initial.unmerged) : ""));
  // Every id the form has loaded: a new row never reuses one, even after its row was removed (see nextId).
  const [loaded, setLoaded] = useState(() => [...(initial.draft ? draftIds(initial.draft) : []), ...provenanceIds]);
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

  // The document pane's "Use as source": the form's own source row, reused when the same document and date are already listed.
  const [reveal, setReveal] = useState<{ id: string } | null>(null); // a new object per press, so the same row scrolls into view again
  function addSource(detail: AddSourceDetail): boolean {
    const base = mode === "form" && draft ? draft : parsed.errors.length === 0 ? toDraft(parsed.caseFile) : null;
    if (!base) {
      setRefusal({ to: "form", errors: parsed.errors });
      return false;
    }
    const same = (s: { doc: string; filedOn: string }) => s.doc.trim().toLowerCase() === detail.doc.trim().toLowerCase() && s.filedOn === detail.filedOn;
    const existing = base.sources.find(same);
    const id = existing?.id ?? nextId("S", [...base.sources.map((x) => x.id), ...loaded]);
    const next = existing ? base : { ...base, sources: [...base.sources, { ...blankSource(id), ...detail }] };
    // From the text sheet, an unchanged sheet still gives back Aksh's own text; the new source makes it differ.
    if (mode === "text") setOrigin(draftToSheet(base));
    setDraft(next);
    setLoaded((ids) => [...new Set([...ids, ...draftIds(next)])]);
    setRefusal(null);
    setMode("form");
    setReveal({ id });
    return true;
  }
  const onAddSource = useRef(addSource);
  useEffect(() => {
    onAddSource.current = addSource;
  });
  useEffect(() => {
    // The event is cancelable: a handled one is cancelled, which is how the pane learns the source is in the form.
    const listener = (event: Event) => {
      if (onAddSource.current((event as CustomEvent<AddSourceDetail>).detail)) event.preventDefault();
    };
    window.addEventListener(ADD_SOURCE_EVENT, listener);
    return () => window.removeEventListener(ADD_SOURCE_EVENT, listener);
  }, []);
  useEffect(() => {
    if (reveal) document.getElementById(`ff-${reveal.id}-doc`)?.scrollIntoView?.({ block: "center" });
  }, [reveal]);

  // Which staged figures are still in the facts: the pairs the save records, and every staged id so a deleted one goes back to review.
  const present = useMemo(() => new Set(mode === "form" ? (draft?.facts.map((f) => f.id) ?? []) : parsed.errors.length === 0 ? parsed.caseFile.facts.map((f) => f.id) : []), [mode, draft, parsed]);
  const pairs = useMemo(() => (initial.merged?.provenance ?? []).filter((p) => present.has(p.factId)), [initial.merged, present]);
  const mergedIds = useMemo(() => (initial.merged?.provenance ?? []).map((p) => p.proposalId), [initial.merged]);
  const staging = {
    pairs,
    /** Every staged figure the form opened with (a row Aksh then deleted is still in this list). */
    mergedIds,
    /** Staged figures that could not be shown because the text sheet does not parse. */
    unseen: initial.merged ? 0 : staged.length,
    skipped: initial.merged?.skipped ?? 0,
    overflow: initial.merged?.overflow ?? 0,
    /** The hidden `provenance` field: null when no staged figure was merged. */
    field: mergedIds.length > 0 ? JSON.stringify({ staged: mergedIds, provenance: pairs }) : null,
  };

  const checkable = useMemo(
    () => (mode === "form" && draft ? checkableFromDraft(draft) : parsed.errors.length === 0 ? checkableFromCaseFile(parsed.caseFile) : []),
    [mode, draft, parsed],
  );

  return {
    mode,
    checkable,
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
    staging,
  };
}

export type FactsState = ReturnType<typeof useFactsState>;
