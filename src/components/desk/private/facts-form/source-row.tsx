import { SOURCE_TYPES, type SourceType } from "@/lib/desk-types";
import type { SourceDraft } from "./draft";
import { SelectField, TextField } from "./field";
import { RowFrame } from "./row-frame";
import type { FieldErrors } from "./validate";

type Props = { row: SourceDraft; onChange(patch: Partial<SourceDraft>): void; onRemove(): void; errors: FieldErrors; rowErrors?: string[] };

export function SourceRow({ row, onChange, onRemove, errors, rowErrors }: Props) {
  const f = (k: keyof SourceDraft) => ({ id: `ff-${row.id}-${k}`, error: errors[`${row.id}.${k}`] });
  return (
    <RowFrame kind="source" id={row.id} onRemove={onRemove} errors={rowErrors}>
      <TextField {...f("doc")} label="Document" value={row.doc} onChange={(doc) => onChange({ doc })} placeholder="Annual report 2025-26" className="col-span-2" />
      <SelectField
        {...f("type")}
        label="Type"
        value={row.type}
        onChange={(type) => onChange({ type: type as SourceType })}
        options={SOURCE_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <TextField {...f("filedOn")} label="Filed on" type="date" value={row.filedOn} onChange={(filedOn) => onChange({ filedOn })} />
      <TextField {...f("url")} label="Link (optional)" inputMode="url" value={row.url} onChange={(url) => onChange({ url })} placeholder="https://" className="col-span-2 desk:col-span-4" />
    </RowFrame>
  );
}
