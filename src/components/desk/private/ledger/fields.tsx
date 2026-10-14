"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { errorText, type ErrorCode } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** Which field a refusal is about. Anything not tied to one field (a state rule, an integrity failure) is about the form as a whole. */
export type FieldName = "company" | "horizon" | "body" | "close" | "date" | "factor" | "note";
const FIELD_OF: Partial<Record<ErrorCode, FieldName>> = {
  "ledger-no-symbol": "company",
  "ledger-company-not-ready": "company",
  "ledger-opposite-open": "company",
  "ledger-item-other-company": "company",
  "ledger-bad-horizon": "horizon",
  "ledger-words-required": "body",
  "ledger-body-too-long": "body",
  "ledger-bad-close": "close",
  "ledger-bad-date": "date",
  "ledger-close-too-early": "date",
  "ledger-close-weekend": "date",
  "ledger-close-too-old": "date",
  "ledger-day-shut": "date",
  "ledger-bad-factor": "factor",
  "ledger-note-too-long": "note",
};
export const errorField = (code: ErrorCode | null): FieldName | null => (code ? (FIELD_OF[code] ?? null) : null);

/**
 * The attributes that tie a field to the error that is about it: it is described by the error's text and, for a control that
 * can be invalid, marked invalid. `hint` is the field's own standing hint, kept in the description.
 */
export function errorProps(code: ErrorCode | null, field: FieldName, errorId: string, hint?: string, invalidAllowed = true) {
  const tied = errorField(code) === field;
  const describedBy = [hint, tied ? errorId : undefined].filter(Boolean).join(" ");
  return {
    "aria-describedby": describedBy || undefined,
    ...(tied && invalidAllowed ? { "aria-invalid": true as const } : {}),
  };
}

/** A group of native radio buttons with a visible legend. Each option is a 44 px row; the choice is also readable without colour. */
export function RadioGroup({ legend, name, value, onChange, options, className, describedBy }: {
  legend: string;
  describedBy?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-1", className)} aria-describedby={describedBy}>
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

/**
 * The refusal of the last submit, in the plain words of its code, beside the form that was refused. What was typed stays.
 * `submitted` is the state object of the submit: each refusal is a new object, so focus moves to the message every time a
 * submit fails (also when it fails the same way twice), and never on first render.
 */
export function FormError({ code, id, submitted }: { code: ErrorCode | null; id: string; submitted?: unknown }) {
  const text = errorText(code ?? undefined);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (text) ref.current?.focus();
  }, [text, submitted]);
  return text ? (
    <p ref={ref} id={id} role="alert" tabIndex={-1} className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink focus-visible:outline-2">
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
