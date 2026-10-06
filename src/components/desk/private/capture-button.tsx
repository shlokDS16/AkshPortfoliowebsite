"use client";

import { Plus } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

/** C's Capture button on every desk screen: thumb corner on phone, in the top bar on desktop. */
export function CaptureButton({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-(--gutter) bottom-[calc(var(--tab-bar-h)+16px)] z-(--z-fab) inline-flex h-12 items-center gap-2 rounded-sm bg-ink px-4 text-body font-medium text-paper transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale) desk:static desk:h-9"
    >
      <Plus aria-hidden strokeWidth={1.5} className="size-5" />
      Capture
      <Kbd className="ml-1 border-paper text-paper">c</Kbd>
    </button>
  );
}
