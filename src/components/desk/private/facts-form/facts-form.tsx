"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { istDate } from "@/lib/dates";
import { CASEFILE_LIMITS as MAX, splitThesisBody } from "@/modules/casefile/client";
import { blankExhibit, blankFact, blankSource, blankTest, nextId, type Draft } from "./draft";
import { ExhibitRow } from "./exhibit-row";
import { FactRow, TOPICS_LIST } from "./fact-row";
import { TextField } from "./field";
import { neighbour, useFocusNext } from "./focus";
import type { RowMarks } from "./marks";
import { FormSection, RowFrame } from "./row-frame";
import { ScenarioSection } from "./scenario-section";
import { SourceRow } from "./source-row";
import { TestRow } from "./test-row";
import { citedFacts, type FieldErrors } from "./validate";

type Props = { draft: Draft; update(fn: (d: Draft) => Draft): void; fields: FieldErrors; rows: Record<string, string[]>; bodyMd: string; loaded: string[]; marks?: RowMarks };

type ListKey = "sources" | "facts" | "tests" | "exhibits";
const FIRST: Record<ListKey, string> = { sources: "doc", facts: "label", tests: "current", exhibits: "title" };
const ADD_ID: Record<ListKey, string> = { sources: "ff-add-sources", facts: "ff-add-facts", tests: "", exhibits: "ff-add-exhibits" };
const full = (n: number, max: number, noun: string) => (n >= max ? `That is the most a file can hold: ${max} ${noun}.` : null);

/** The facts sheet as a form, section by section. It edits the structured facts only; Aksh's words stay in the body field. */
export function FactsForm({ draft: d, update, fields, rows, bodyMd, loaded, marks = {} }: Props) {
  const [notice, setNotice] = useState("");
  const focus = useFocusNext();
  const conditions = useMemo(() => splitThesisBody(bodyMd).conditions, [bodyMd]);
  const cited = useMemo(() => citedFacts(bodyMd), [bodyMd]);
  const today = istDate(new Date());
  const ids = (key: ListKey) => d[key].map((r) => r.id);
  // High-water mark: rows now, rows as loaded, and the body's citations, so no new row takes a removed row's id.
  const freshId = (key: ListKey, prefix: string) => nextId(prefix, [...ids(key), ...loaded, ...(key === "facts" ? cited : [])]);
  const patch = <K extends ListKey>(key: K, id: string) => (p: Partial<Draft[K][number]>) =>
    update((x) => ({ ...x, [key]: (x[key] as Draft[K]).map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const add = <K extends ListKey>(key: K, row: Draft[K][number]) => {
    update((x) => ({ ...x, [key]: [...x[key], row] }));
    focus(`ff-${row.id}-${FIRST[key]}`);
  };
  const remove = (key: ListKey, id: string, fallback = ADD_ID[key]) => () => {
    const list = ids(key);
    const i = list.indexOf(id);
    const n = neighbour(i, list.length);
    update((x) => ({ ...x, [key]: (x[key] as { id: string }[]).filter((r) => r.id !== id) }));
    focus(n === null ? fallback : `ff-${list.filter((r) => r !== id)[n]}-${FIRST[key]}`);
  };
  const removeSource = (id: string) => () => {
    const users = [...d.facts, ...d.exhibits].filter((r) => r.sourceId === id).map((r) => r.id);
    if (users.length > 0) return setNotice(`${id} is the source of ${users.join(", ")}. Pick another source for those rows first.`);
    setNotice("");
    remove("sources", id)();
  };
  const removeNote = (i: number) => () => {
    const n = neighbour(i, d.readFirst.length);
    update((x) => ({ ...x, readFirst: x.readFirst.filter((_, k) => k !== i) }));
    focus(n === null ? "ff-add-readFirst" : `ff-R${n}-slug`);
  };
  const firstSource = d.sources[0]?.id ?? "";
  const missing = conditions.filter((c) => !d.tests.some((t) => t.id === c.id));
  const topics = [...new Set(d.facts.map((f) => f.topic.trim()).filter(Boolean))];
  return (
    <div className="space-y-(--block-gap)">
      <FormSection title="Company line">
        <TextField id="ff-O-oneLiner" label="One line about the company" value={d.oneLiner} error={fields["O.oneLiner"]} onChange={(oneLiner) => update((x) => ({ ...x, oneLiner }))} />
      </FormSection>

      <FormSection title="Sources" addLabel="Add source" addId={ADD_ID.sources} fullNote={full(d.sources.length, MAX.sources, "sources")} onAdd={() => add("sources", blankSource(freshId("sources", "S")))}>
        {d.sources.map((s) => (
          <SourceRow key={s.id} row={s} onChange={patch("sources", s.id)} onRemove={removeSource(s.id)} errors={fields} rowErrors={rows[s.id]} />
        ))}
        {notice ? (
          <p role="alert" className="text-small text-bad">
            {notice}
          </p>
        ) : null}
      </FormSection>

      <FormSection
        title="Facts"
        hint="Cite a fact in the body as [F1]. Ids never change and are never reused, so citations keep pointing at the same fact."
        addLabel="Add fact"
        addId={ADD_ID.facts}
        fullNote={full(d.facts.length, MAX.facts, "facts")}
        onAdd={() => add("facts", blankFact(freshId("facts", "F"), firstSource))}
      >
        <datalist id={TOPICS_LIST}>
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {d.facts.map((f) => (
          <FactRow key={f.id} row={f} sources={d.sources} onChange={patch("facts", f.id)} onRemove={remove("facts", f.id)} errors={fields} rowErrors={rows[f.id]} cited={cited.includes(f.id)} mark={marks[f.id]} />
        ))}
      </FormSection>

      <FormSection title="Test readings" hint='One reading per "- T1: …" condition in the body. The condition is your words; edit it in the body.'>
        {d.tests.map((t) => (
          <TestRow
            key={t.id}
            row={t}
            condition={conditions.find((c) => c.id === t.id)?.text ?? null}
            onChange={patch("tests", t.id)}
            onRemove={remove("tests", t.id, `ff-add-reading-${t.id}`)}
            errors={fields}
            rowErrors={rows[t.id]}
          />
        ))}
        {missing.map((c) => (
          <div key={c.id} className="space-y-2 border-t border-rule pt-3">
            <p className="text-small text-ink-body">
              <span className="mr-2 font-mono text-mono-id text-geru">{c.id}</span>
              {c.text}
            </p>
            {d.tests.length < MAX.tests ? (
              <Button id={`ff-add-reading-${c.id}`} type="button" variant="outline" size="sm" onClick={() => add("tests", blankTest(c.id, today))}>
                Add reading for {c.id}
              </Button>
            ) : (
              <p className="text-caption text-ink-muted">{full(d.tests.length, MAX.tests, "test readings")}</p>
            )}
          </div>
        ))}
        {conditions.length === 0 && d.tests.length === 0 ? (
          <p className="text-small text-ink-muted">No tests yet. Write each as &quot;- T1: …&quot; under &quot;## What would prove me wrong&quot; in the body.</p>
        ) : null}
      </FormSection>

      <FormSection title="Exhibits" addLabel="Add exhibit" addId={ADD_ID.exhibits} fullNote={full(d.exhibits.length, MAX.exhibits, "exhibits")} onAdd={() => add("exhibits", blankExhibit(freshId("exhibits", "X"), firstSource))}>
        {d.exhibits.map((x) => (
          <ExhibitRow key={x.id} row={x} sources={d.sources} testIds={ids("tests")} onChange={patch("exhibits", x.id)} onRemove={remove("exhibits", x.id)} errors={fields} rowErrors={rows[x.id]} focus={focus} />
        ))}
      </FormSection>

      <FormSection
        title="Read first"
        hint="The slug of a published learning note, as in its address."
        addLabel="Add note"
        addId="ff-add-readFirst"
        fullNote={full(d.readFirst.length, MAX.readFirst, "notes")}
        onAdd={() => {
          update((x) => ({ ...x, readFirst: [...x.readFirst, ""] }));
          focus(`ff-R${d.readFirst.length}-slug`);
        }}
      >
        {d.readFirst.map((slug, i) => (
          <RowFrame key={i} kind="read-first note" id={`R${i + 1}`} onRemove={removeNote(i)} errors={rows[`R${i}`]}>
            <TextField
              id={`ff-R${i}-slug`}
              label="Note slug"
              value={slug}
              error={fields[`R${i}.slug`]}
              onChange={(v) => update((x) => ({ ...x, readFirst: x.readFirst.map((s, k) => (k === i ? v : s)) }))}
              placeholder="how-to-read-receivable-days"
              className="col-span-2"
            />
          </RowFrame>
        ))}
      </FormSection>

      <ScenarioSection scenario={d.scenario} onChange={(scenario) => update((x) => ({ ...x, scenario }))} errors={fields} rowErrors={rows} focus={focus} />
    </div>
  );
}
