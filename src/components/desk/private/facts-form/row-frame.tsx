import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FrameProps = {
  /** Spoken kind ("fact", "source"); the legend reads "Fact F3" and the button "Remove fact F3". */
  kind: string;
  id: string;
  onRemove?: () => void;
  errors?: string[];
  note?: ReactNode;
  children: ReactNode;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One row of the facts: a hairline above, the mono id, the fields stacked on a phone and in a grid on desktop. */
export function RowFrame({ kind, id, onRemove, errors = [], note, children }: FrameProps) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-rule pt-3">
      <legend className="sr-only">{`${cap(kind)} ${id}`}</legend>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span aria-hidden className="font-mono text-mono-id text-geru">
          {id}
        </span>
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${kind} ${id}`}>
            Remove
          </Button>
        ) : null}
      </div>
      {note}
      <div className="grid grid-cols-2 gap-3 desk:grid-cols-4">{children}</div>
      {errors.length > 0 ? (
        <ul className="space-y-0.5 text-small text-bad">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

type SectionProps = { title: string; hint?: string; addLabel?: string; onAdd?: () => void; children: ReactNode; className?: string };

/** A labelled block of rows with its Add button at the foot, where the next row will appear. */
export function FormSection({ title, hint, addLabel, onAdd, children, className }: SectionProps) {
  // No landmark per block (the Facts editor is the one region); the h4 is there for heading navigation.
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h4 className="font-mono text-mono-label uppercase text-ink-muted">
          {title}
        </h4>
        {hint ? <p className="text-caption text-ink-muted">{hint}</p> : null}
      </div>
      {children}
      {onAdd && addLabel ? (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          {addLabel}
        </Button>
      ) : null}
    </section>
  );
}
