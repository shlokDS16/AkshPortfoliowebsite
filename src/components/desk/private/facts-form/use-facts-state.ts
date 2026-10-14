"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { latestFigureDate, parseFactsSheet, type SheetError } from "@/modules/casefile/client";
import type { StagedReading, StagedRow } from "@/modules/ingestion/client";
import { ADD_FACT_EVENT, ADD_SOURCE_EVENT, type AddFactDetail, type AddSourceDetail } from "../add-source-event";
import { withFact, withSource } from "./add-fact";
import { checkableFromCaseFile, checkableFromDraft } from "./checkable";
import { draftIds, draftToSheet, toDraft, type Draft } from "./draft";
import { mergeReadings, mergeStaged } from "./staged";
import { brokenCitations, citedFacts, fieldErrors, rowErrors } from "./validate";

export type FactsMode = "form" | "text";

/**
 * One facts state for both modes. The text sheet is the only thing saved; the form is a view over it, converted with
 * casefile's parseFactsSheet / serializeFactsSheet. A switch that could lose typed input is refused and says why.
 */
export function useFactsState(sheet: string, bodyMd: string, staged: StagedRow[] = [], provenanceIds: string[] = [], stagedReadings: StagedReading[] = []) {
  // The staged figures are merged once, as the form opens (ADR-004 s4.7): after that they are rows like any other.
  const [initial] = useState(() => {
    const parsed = parseFactsSheet(sheet);
    if (parsed.errors.length > 0) return { mode: "text" as FactsMode, draft: null, unmerged: null, merged: null, readings: null };
    const unmerged = toDraft(parsed.caseFile);
    const merged = staged.length > 0 ? mergeStaged(unmerged, staged, [...citedFacts(bodyMd), ...provenanceIds]) : null;
    // Staged test readings go into the test rows after the figures; they change a test's reading fields and nothing else.
    const readings = stagedReadings.length > 0 ? mergeReadings(merged?.draft ?? unmerged, stagedReadings) : null;
    return { mode: "form" as FactsMode, draft: readings?.draft ?? merged?.draft ?? unmerged, unmerged, merged, readings };
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

  // The document pane's "Use as source" and "Use as a fact": the form's own rows, the source reused when the same document and date are already listed.
  const [reveal, setReveal] = useState<{ id: string; field: string } | null>(null); // a new object per press, so the same row scrolls into view again
  /** The draft the pane's button works on, or null (with the refusal shown) when the text sheet cannot open as a form. */
  function baseDraft(): Draft | null {
    const base = mode === "form" && draft ? draft : parsed.errors.length === 0 ? toDraft(parsed.caseFile) : null;
    if (!base) setRefusal({ to: "form", errors: parsed.errors });
    return base;
  }
  function show(base: Draft, next: Draft, to: { id: string; field: string }) {
    // From the text sheet, an unchanged sheet still gives back Aksh's own text; the new row makes it differ.
    if (mode === "text") setOrigin(draftToSheet(base));
    setDraft(next);
    setLoaded((ids) => [...new Set([...ids, ...draftIds(next)])]);
    setRefusal(null);
    setMode("form");
    setReveal(to);
  }
  function addSource(detail: AddSourceDetail): boolean {
    const base = baseDraft();
    if (!base) return false;
    const { draft: next, sourceId } = withSource(base, detail, loaded);
    show(base, next, { id: sourceId, field: "doc" });
    return true;
  }
  function addFact(detail: AddFactDetail): boolean {
    const base = baseDraft();
    if (!base) return false;
    // A removed row's id is never reused, and nor is an id the body already cites (the Add fact button reserves the same).
    const added = withFact(base, detail, [...loaded, ...citedFacts(bodyMd)]);
    if (!added) return false;
    show(base, added.draft, { id: added.factId, field: "label" });
    return true;
  }
  const onAddSource = useRef(addSource);
  const onAddFact = useRef(addFact);
  useEffect(() => {
    onAddSource.current = addSource;
    onAddFact.current = addFact;
  });
  useEffect(() => {
    // The events are cancelable: a handled one is cancelled, which is how the pane learns the row is in the form.
    const source = (event: Event) => {
      if (onAddSource.current((event as CustomEvent<AddSourceDetail>).detail)) event.preventDefault();
    };
    const fact = (event: Event) => {
      if (onAddFact.current((event as CustomEvent<AddFactDetail>).detail)) event.preventDefault();
    };
    window.addEventListener(ADD_SOURCE_EVENT, source);
    window.addEventListener(ADD_FACT_EVENT, fact);
    return () => {
      window.removeEventListener(ADD_SOURCE_EVENT, source);
      window.removeEventListener(ADD_FACT_EVENT, fact);
    };
  }, []);
  useEffect(() => {
    if (!reveal) return;
    const field = document.getElementById(`ff-${reveal.id}-${reveal.field}`);
    field?.scrollIntoView?.({ block: "center" });
    // A new fact's label is the next thing Aksh types.
    if (reveal.field === "label") field?.focus?.();
  }, [reveal]);

  // Which staged figures are still in the facts: the pairs the save records, and every staged id so a deleted one goes back to review.
  const present = useMemo(() => new Set(mode === "form" ? (draft?.facts.map((f) => f.id) ?? []) : parsed.errors.length === 0 ? parsed.caseFile.facts.map((f) => f.id) : []), [mode, draft, parsed]);
  const pairs = useMemo(() => (initial.merged?.provenance ?? []).filter((p) => present.has(p.factId)), [initial.merged, present]);
  const mergedIds = useMemo(() => (initial.merged?.provenance ?? []).map((p) => p.proposalId), [initial.merged]);
  const testsNow = useMemo(() => new Set(mode === "form" ? (draft?.tests.map((t) => t.id) ?? []) : parsed.errors.length === 0 ? parsed.caseFile.tests.map((t) => t.id) : []), [mode, draft, parsed]);
  const appliedReadings = initial.readings?.applied ?? [];
  const staging = {
    pairs,
    /** The staged test readings the form opened with, applied to a test (the field names all of them; the server sends back those whose test was removed). */
    readingPairs: appliedReadings,
    /** The applied readings whose test is still in the file. */
    readingsPresent: appliedReadings.filter((r) => testsNow.has(r.testId)).map((r) => r.proposalId),
    /** Staged readings that could not be shown because the text sheet does not parse. */
    unseenReadings: initial.readings || initial.draft ? 0 : stagedReadings.length,
    skippedReadings: initial.readings?.skipped ?? 0,
    /** Every staged figure the form opened with (a row Aksh then deleted is still in this list). */
    mergedIds,
    /** Staged figures that could not be shown because the text sheet does not parse. */
    unseen: initial.merged ? 0 : staged.length,
    skipped: initial.merged?.skipped ?? 0,
    overflow: initial.merged?.overflow ?? 0,
    /** The hidden `provenance` field: null when no staged figure or reading was merged. */
    field:
      mergedIds.length > 0 || appliedReadings.length > 0
        ? JSON.stringify({ staged: mergedIds, provenance: pairs, ...(appliedReadings.length > 0 ? { stagedReadings: appliedReadings } : {}) })
        : null,
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
