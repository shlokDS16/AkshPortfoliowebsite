import type { TestStatus } from "@/lib/desk-types";
import type { TestDraft } from "./draft";
import { SelectField, TextField } from "./field";
import { RowFrame } from "./row-frame";
import type { FieldErrors } from "./validate";

type Props = {
  row: TestDraft;
  /** Aksh's condition from the body ("- T1: …"), shown read-only; null when the body has no such line. */
  condition: string | null;
  onChange(patch: Partial<TestDraft>): void;
  onRemove(): void;
  errors: FieldErrors;
  rowErrors?: string[];
};

const STATUS: { value: TestStatus; label: string }[] = [
  { value: "met", label: "Met" },
  { value: "watching", label: "Watching" },
  { value: "not_met", label: "Not met" },
  { value: "no_data", label: "No data" },
];

export function TestRow({ row, condition, onChange, onRemove, errors, rowErrors }: Props) {
  const f = (k: keyof TestDraft) => ({ id: `ff-${row.id}-${k}`, error: errors[`${row.id}.${k}`] });
  const set = (k: keyof TestDraft) => (v: string) => onChange({ [k]: v });
  const note = condition ? (
    <p className="border-l-2 border-rule-strong pl-3 text-small text-ink-body">
      <span className="block text-caption text-ink-muted">Condition, from your body text</span>
      {condition}
    </p>
  ) : (
    <p className="text-small text-warn">The body has no &quot;- {row.id}: …&quot; line under &quot;What would prove me wrong&quot;.</p>
  );
  return (
    <RowFrame kind="test reading" id={row.id} onRemove={onRemove} errors={rowErrors} note={note}>
      <TextField {...f("current")} label="Reading (blank if none)" value={row.current} onChange={set("current")} placeholder="142" />
      <TextField {...f("unit")} label="Unit" value={row.unit} onChange={set("unit")} placeholder="days" />
      <TextField {...f("readingAsOf")} label="Reading date" type="date" value={row.readingAsOf} onChange={set("readingAsOf")} />
      <TextField {...f("lastChecked")} label="Last checked" type="date" value={row.lastChecked} onChange={set("lastChecked")} />
      <SelectField {...f("status")} label="Status" value={row.status} onChange={set("status")} options={STATUS} />
      <SelectField
        {...f("direction")}
        label="Above or below"
        value={row.direction}
        onChange={set("direction")}
        options={[
          { value: "above", label: "Above" },
          { value: "below", label: "Below" },
        ]}
      />
      <TextField {...f("threshold")} label="Threshold" value={row.threshold} onChange={set("threshold")} placeholder="150" />
      <TextField {...f("prior")} label="Prior reading" value={row.prior} onChange={set("prior")} placeholder="131" />
      <TextField {...f("min")} label="Scale min" value={row.min} onChange={set("min")} placeholder="60" />
      <TextField {...f("max")} label="Scale max" value={row.max} onChange={set("max")} placeholder="200" />
    </RowFrame>
  );
}
