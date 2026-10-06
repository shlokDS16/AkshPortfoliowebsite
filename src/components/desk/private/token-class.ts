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
