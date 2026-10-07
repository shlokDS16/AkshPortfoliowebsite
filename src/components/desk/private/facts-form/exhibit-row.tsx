import { Button } from "@/components/ui/button";
import type { ExhibitDraft, PointDraft, SourceDraft } from "./draft";
import { sourceOptions } from "./fact-row";
import { SelectField, TextField } from "./field";
import { neighbour, type Focus } from "./focus";
import { RowFrame } from "./row-frame";
import type { FieldErrors } from "./validate";

type Props = {
  row: ExhibitDraft;
  sources: SourceDraft[];
  testIds: string[];
  onChange(patch: Partial<ExhibitDraft>): void;
  onRemove(): void;
  errors: FieldErrors;
  rowErrors?: string[];
  focus: Focus;
};

const MAX_POINTS = 12;
const MIN_POINTS = 2;

export function ExhibitRow({ row, sources, testIds, onChange, onRemove, errors, rowErrors, focus }: Props) {
  const f = (k: string) => ({ id: `ff-${row.id}-${k.replace(/\./g, "-")}`, error: errors[`${row.id}.${k}`] });
  const periodId = (i: number) => `ff-${row.id}-points-${i}-period`;
  const addPoint = () => {
    onChange({ points: [...row.points, { period: "", value: "" }] });
    focus(periodId(row.points.length));
  };
  const removePoint = (i: number) => {
    const n = neighbour(i, row.points.length);
    onChange({ points: row.points.filter((_, k) => k !== i) });
    focus(n === null ? `ff-add-point-${row.id}` : periodId(n));
  };
  const setPoint = (i: number, patch: Partial<PointDraft>) => onChange({ points: row.points.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const tests = [{ value: "", label: "None" }, ...[...new Set([...testIds, ...(row.testId ? [row.testId] : [])])].map((t) => ({ value: t, label: t }))];
  return (
    <RowFrame kind="exhibit" id={row.id} onRemove={onRemove} errors={rowErrors}>
      <TextField {...f("title")} label="Title" value={row.title} onChange={(title) => onChange({ title })} placeholder="Receivable days, FY22 to FY26" className="col-span-2" />
      <TextField {...f("unit")} label="Unit" value={row.unit} onChange={(unit) => onChange({ unit })} placeholder="days" />
      <SelectField {...f("sourceId")} label="Source" value={row.sourceId} onChange={(sourceId) => onChange({ sourceId })} options={sourceOptions(sources, row.sourceId)} />
      <SelectField {...f("testId")} label="Linked test (optional)" value={row.testId} onChange={(testId) => onChange({ testId })} options={tests} />
      <ol className="col-span-2 space-y-3 desk:col-span-4">
        {row.points.map((p, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
            <TextField {...f(`points.${i}.period`)} label={`Period ${i + 1}`} value={p.period} onChange={(period) => setPoint(i, { period })} placeholder="FY26" />
            <TextField {...f(`points.${i}.value`)} label={`Value ${i + 1}`} value={p.value} onChange={(value) => setPoint(i, { value })} placeholder="blank if none" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-1.5 pointer-coarse:mb-0"
              disabled={row.points.length <= MIN_POINTS}
              aria-label={`Remove period ${i + 1} from exhibit ${row.id}`}
              onClick={() => removePoint(i)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      {row.points.length < MAX_POINTS ? (
        <div className="col-span-2 desk:col-span-4">
          <Button id={`ff-add-point-${row.id}`} type="button" variant="outline" size="sm" onClick={addPoint} aria-label={`Add a period to exhibit ${row.id}`}>
            Add a period
          </Button>
        </div>
      ) : null}
    </RowFrame>
  );
}
