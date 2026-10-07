import { Button } from "@/components/ui/button";
import { blankScenario, type OutputDraft, type RowDraft, type ScenarioDraft } from "./draft";
import { TextField } from "./field";
import { FormSection, RowFrame } from "./row-frame";
import type { FieldErrors } from "./validate";

type Props = {
  scenario: ScenarioDraft | null;
  onChange(next: ScenarioDraft | null): void;
  errors: FieldErrors;
  rowErrors: Record<string, string[]>;
};

const MAX_ROWS = 8;

/** SC / A / Y: scenario names, assumption rows and operating output rows (rule 9: never a value, price or target). */
export function ScenarioSection({ scenario: s, onChange, errors, rowErrors }: Props) {
  if (!s) {
    return (
      <FormSection title="Scenario" hint="Optional. Operating outputs only: no value, price or target rows." addLabel="Add a scenario" onAdd={() => onChange(blankScenario())}>
        {null}
      </FormSection>
    );
  }
  const err = (key: string) => ({ id: `ff-${key.replace(/\./g, "-")}`, error: errors[key] });
  const setNames = (names: string[], fit: (values: string[]) => string[]) =>
    onChange({ names, assumptions: s.assumptions.map((a) => ({ ...a, values: fit(a.values) })), outputs: s.outputs.map((y) => ({ ...y, values: fit(y.values) })) });
  const setRow = <K extends "assumptions" | "outputs">(kind: K, i: number, patch: Partial<ScenarioDraft[K][number]>) =>
    onChange({ ...s, [kind]: s[kind].map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const values = (key: string, row: RowDraft, set: (values: string[]) => void) =>
    row.values.map((v, j) => (
      <TextField key={j} {...err(`${key}.values.${j}`)} label={s.names[j]?.trim() || `Scenario ${j + 1}`} value={v} onChange={(nv) => set(row.values.map((x, k) => (k === j ? nv : x)))} />
    ));
  const blank = () => s.names.map(() => "");
  return (
    <FormSection title="Scenario" hint="Operating outputs only: no value, price or target rows.">
      <RowFrame kind="scenario" id="SC" onRemove={() => onChange(null)} errors={rowErrors.SC}>
        {s.names.map((n, j) => (
          <TextField key={j} {...err(`SC.names.${j}`)} label={`Scenario ${j + 1} name`} value={n} onChange={(nv) => setNames(s.names.map((x, k) => (k === j ? nv : x)), (v) => v)} placeholder={["Slow", "Base", "Fast", "Boom"][j]} />
        ))}
        <div className="col-span-2 flex flex-wrap gap-2 desk:col-span-4">
          {s.names.length < 4 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setNames([...s.names, ""], (v) => [...v, ""])}>
              Add a scenario name
            </Button>
          ) : null}
          {s.names.length > 2 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setNames(s.names.slice(0, -1), (v) => v.slice(0, s.names.length - 1))} aria-label={`Remove scenario ${s.names.length}`}>
              Remove the last scenario
            </Button>
          ) : null}
        </div>
      </RowFrame>
      {s.assumptions.map((a, i) => (
        <RowFrame key={`A${i}`} kind="assumption" id={`A${i + 1}`} onRemove={() => onChange({ ...s, assumptions: s.assumptions.filter((_, k) => k !== i) })} errors={rowErrors[`A${i}`]}>
          <TextField {...err(`A${i}.label`)} label="Input" value={a.label} onChange={(label) => setRow("assumptions", i, { label })} placeholder="Volume growth" className="col-span-2" />
          {values(`A${i}`, a, (vs) => setRow("assumptions", i, { values: vs }))}
        </RowFrame>
      ))}
      {s.outputs.map((y: OutputDraft, i) => (
        <RowFrame key={`Y${i}`} kind="output" id={`Y${i + 1}`} onRemove={s.outputs.length > 1 ? () => onChange({ ...s, outputs: s.outputs.filter((_, k) => k !== i) }) : undefined} errors={rowErrors[`Y${i}`]}>
          <TextField {...err(`Y${i}.label`)} label="Output" value={y.label} onChange={(label) => setRow("outputs", i, { label })} placeholder="FY28 revenue" className="col-span-2" />
          <TextField {...err(`Y${i}.unit`)} label="Unit" value={y.unit} onChange={(unit) => setRow("outputs", i, { unit })} placeholder="₹ cr" />
          {values(`Y${i}`, y, (vs) => setRow("outputs", i, { values: vs }))}
        </RowFrame>
      ))}
      <div className="flex flex-wrap gap-2">
        {s.assumptions.length < MAX_ROWS ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...s, assumptions: [...s.assumptions, { label: "", values: blank() }] })}>
            Add an assumption
          </Button>
        ) : null}
        {s.outputs.length < MAX_ROWS ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...s, outputs: [...s.outputs, { label: "", unit: "", values: blank() }] })}>
            Add an output
          </Button>
        ) : null}
      </div>
    </FormSection>
  );
}
