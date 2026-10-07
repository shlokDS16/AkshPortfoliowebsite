import type { CaptureTokenKind } from "@/modules/capture/client";

// design-dna s17 item 15. Backgrounds and underlines only: colour never changes a glyph's width.
export const TOKEN_CLASS: Record<CaptureTokenKind, string> = {
  plain: "text-ink",
  key: "rounded-xs bg-ink text-paper",
  company: "rounded-xs bg-geru-wash text-geru",
  "company-new": "rounded-xs bg-geru-wash text-geru underline decoration-dashed decoration-1 underline-offset-3",
  theme: "rounded-xs bg-surface-2 text-ink",
  "theme-new": "rounded-xs bg-surface-2 text-ink underline decoration-dashed decoration-1 underline-offset-3",
  url: "text-geru underline decoration-dotted decoration-1 underline-offset-3",
};

/**
 * M7: inline padding for the read-only chips (Today tray), so an inverted t: chip does not hug its glyphs or abut the
 * next chip. Never used by the capture mirror: its text must stay glyph-aligned with the textarea above it.
 */
export const CHIP_PAD: Partial<Record<CaptureTokenKind, string>> = {
  key: "px-0.5",
  company: "px-0.5",
  "company-new": "px-0.5",
  theme: "px-0.5",
  "theme-new": "px-0.5",
};
