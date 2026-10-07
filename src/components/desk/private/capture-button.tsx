"use client";

import { Plus } from "lucide-react";
import type { Ref } from "react";
import { Kbd } from "@/components/ui/kbd";

/** C's Capture button on every desk screen: thumb corner on phone, in the top bar on desktop. */
export function CaptureButton({ onClick, ref }: { onClick(): void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-keyshortcuts="c /"
      className="fixed right-(--gutter) bottom-[calc(var(--tab-bar-h)+16px)] z-(--z-fab) inline-flex h-12 items-center gap-2 rounded-sm bg-ink px-4 text-body font-medium text-paper transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale) desk:static desk:h-9"
    >
      <Plus aria-hidden strokeWidth={1.5} className="size-5" />
      Capture
      <span aria-hidden="true" className="ml-1 hidden desk:contents">
        <Kbd className="border-paper text-paper">c</Kbd>
      </span>
    </button>
  );
}
