import type { FactDraft, SourceDraft } from "./draft";
import { SelectField, TextField } from "./field";
import { ProvenanceChip } from "./provenance-chip";
import { RowFrame } from "./row-frame";
import type { FieldErrors } from "./validate";

type Props = {
  row: FactDraft;
  sources: SourceDraft[];
  onChange(patch: Partial<FactDraft>): void;
  onRemove(): void;
  errors: FieldErrors;
  rowErrors?: string[];
  /** The body cites this fact as [F3]; removing it will be flagged before saving. */
  cited: boolean;
  /** "From <doc>, p. 4" on a figure staged from a document, or the provenance chip on a saved one. */
  mark?: { staged?: string; chip?: string };
};

/** The `<datalist>` of the file's topics, rendered once by FactsForm; every Topic field suggests from it. */
export const TOPICS_LIST = "ff-topics";

export const sourceOptions = (sources: SourceDraft[], value: string) => [
  ...(sources.some((s) => s.id === value) ? [] : [{ value, label: sources.length ? "Pick a source" : "Add a source first" }]),
  ...sources.map((s) => ({ value: s.id, label: s.doc.trim() ? `${s.id} · ${s.doc}` : s.id })),
];

export function FactRow({ row, sources, onChange, onRemove, errors, rowErrors, cited, mark }: Props) {
  const f = (k: keyof FactDraft) => ({ id: `ff-${row.id}-${k}`, error: errors[`${row.id}.${k}`] });
  const set = (k: keyof FactDraft) => (v: string) => onChange({ [k]: v });
  return (
    <RowFrame
      kind="fact"
      id={row.id}
      onRemove={onRemove}
      errors={rowErrors}
      note={
        cited || mark ? (
          <div className="flex flex-col gap-1">
            {mark?.staged ? <p className="text-caption text-ink-body" data-testid="staged-note">{mark.staged}</p> : null}
            {mark?.chip ? <ProvenanceChip text={mark.chip} /> : null}
            {cited ? <p className="text-caption text-ink-muted">Cited in the body as [{row.id}].</p> : null}
          </div>
        ) : null
      }
    >
      <TextField {...f("label")} label="Metric" value={row.label} onChange={set("label")} placeholder="Revenue from operations" className="col-span-2" />
      <TextField {...f("value")} label="Value" value={row.value} onChange={set("value")} placeholder="1284" />
      <TextField {...f("unit")} label="Unit" value={row.unit} onChange={set("unit")} placeholder="₹ cr" />
      <TextField {...f("period")} label="Period" value={row.period} onChange={set("period")} placeholder="FY26" />
      <TextField {...f("asOf")} label="As of" type="date" value={row.asOf} onChange={set("asOf")} />
      <SelectField {...f("sourceId")} label="Source" value={row.sourceId} onChange={set("sourceId")} options={sourceOptions(sources, row.sourceId)} />
      <TextField {...f("locator")} label="Page or locator" value={row.locator} onChange={set("locator")} placeholder="p. 131" />
      <TextField {...f("priorLabel")} label="Prior period" value={row.priorLabel} onChange={set("priorLabel")} placeholder="FY25" />
      <TextField {...f("priorValue")} label="Prior value" value={row.priorValue} onChange={set("priorValue")} placeholder="1102" />
      <TextField {...f("quote")} label="Quoted line (optional)" value={row.quote} onChange={set("quote")} className="col-span-2" />
      <TextField {...f("topic")} label="Topic (optional)" list={TOPICS_LIST} value={row.topic} onChange={set("topic")} placeholder="Working capital" className="col-span-2" />
    </RowFrame>
  );
}
