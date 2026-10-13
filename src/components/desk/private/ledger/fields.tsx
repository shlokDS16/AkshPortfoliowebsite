import type { ReactNode } from "react";
import { errorText, type ErrorCode } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** A group of native radio buttons with a visible legend. Each option is a 44 px row; the choice is also readable without colour. */
export function RadioGroup({ legend, name, value, onChange, options, className }: {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-1", className)}>
      <legend className="text-small text-ink-muted desk:text-small-desk">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-11 items-center gap-2 text-body text-ink">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} required className="size-5 accent-ink" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

/** The refusal of the last submit, in the plain words of its code, beside the form that was refused. What was typed stays. */
export function FormError({ code, id }: { code: ErrorCode | null; id: string }) {
  const text = errorText(code ?? undefined);
  return text ? (
    <p id={id} role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
      {text}
    </p>
  ) : null;
}

export function Hint({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-caption text-ink-muted">
      {children}
    </p>
  );
}

export const SELECT = "block min-h-11 w-full rounded-sm border border-input bg-paper px-2 text-body text-ink";
