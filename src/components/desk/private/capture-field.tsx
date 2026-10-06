"use client";

import { useCallback, useMemo, useRef, type Ref, type RefObject } from "react";
import { highlightCapture, insertToken, type KnownTokens, type TokenKey } from "@/modules/capture/client";
import type { KnownTokenLists } from "@/modules/catalog";
import { toKnownTokens } from "./known-tokens";
import { TOKEN_CLASS } from "./token-class";

export function useKnown(lists: KnownTokenLists): KnownTokens {
  return useMemo(() => toKnownTokens(lists), [lists]);
}

export function useTokenInsert(ref: RefObject<HTMLTextAreaElement | null>, value: string, setValue: (v: string) => void) {
  return useCallback(
    (token: TokenKey) => {
      const el = ref.current;
      const next = insertToken(value, el?.selectionStart ?? value.length, token);
      setValue(next.value);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(next.caret, next.caret);
      });
    },
    [ref, value, setValue],
  );
}

type Props = {
  id: string;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  known: KnownTokens;
  placeholder: string;
  autoFocus?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};

/** Textarea over a highlight mirror (segment 4 A). Enter saves, Shift+Enter adds a line (spec s5). */
export function CaptureField({ id, value, onChange, onSubmit, known, placeholder, autoFocus, ref }: Props) {
  const mirror = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => highlightCapture(value, known), [value, known]);
  return (
    <div className="relative">
      <div
        ref={mirror}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm border border-transparent px-3 py-2.5 text-body break-words whitespace-pre-wrap"
      >
        {tokens.map((t, i) => (
          <span key={i} className={TOKEN_CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
        {"\n"}
      </div>
      <textarea
        ref={ref}
        id={id}
        aria-label="Capture"
        value={value}
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="relative block min-h-24 w-full resize-none rounded-sm border border-input bg-transparent px-3 py-2.5 text-body text-transparent caret-ink [scrollbar-width:none] field-sizing-content placeholder:text-ink-muted"
      />
    </div>
  );
}
