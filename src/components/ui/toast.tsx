"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** design-dna 10.2: 8 px rise + fade, 4 s, polite, never steals focus. role=status (errata A1.7). */
export function Toast({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-h)+16px)] z-(--z-toast) flex justify-center px-(--gutter)">
      {message ? <p className="toast-in rounded-sm bg-ink px-4 py-2 text-body text-paper">{message}</p> : null}
    </div>
  );
}

export function useToast(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [message, show];
}
