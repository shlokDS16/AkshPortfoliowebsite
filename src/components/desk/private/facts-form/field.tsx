import type { ComponentProps, ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Base = { id: string; label: string; error?: string; className?: string };
type TextProps = Base & { value: string; onChange(value: string): void } & Pick<ComponentProps<"input">, "type" | "inputMode" | "placeholder">;
type SelectProps = Base & { value: string; onChange(value: string): void; options: { value: string; label: string }[] };

/** Label above, error below in plain words; the error is the field's description, so a screen reader hears it. */
function Shell({ id, label, error, className, children }: Base & { children: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={id} className="block">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex gap-1 text-caption text-bad">
          <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ id, label, error, className, value, onChange, ...rest }: TextProps) {
  return (
    <Shell id={id} label={label} error={error} className={className}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-w-0 tabular-nums"
        {...rest}
      />
    </Shell>
  );
}

export function SelectField({ id, label, error, className, value, onChange, options }: SelectProps) {
  return (
    <Shell id={id} label={label} error={error} className={className}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="block min-h-11 w-full min-w-0 rounded-sm border border-input bg-paper px-2 text-body text-ink aria-invalid:border-bad"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}
