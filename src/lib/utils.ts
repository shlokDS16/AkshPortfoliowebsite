import { createCn } from "cn/config";

// The desk's @theme text tokens are font sizes. Unconfigured, cn (tailwind-merge parity) reads them as
// colours and drops e.g. text-label when text-ink-muted follows. Keep this list equal to the --text-* tokens.
export const DESK_TEXT = [
  "display", "display-desk", "title", "title-desk", "subtitle", "subtitle-desk", "read", "read-desk", "body",
  "data", "data-desk", "small", "small-desk", "caption", "label", "figure-lg", "figure-lg-desk", "figure-md",
  "figure-md-desk", "mono-id", "mono-label", "mono-tag", "mono-inline",
];

export const cn = createCn({ extend: { classGroups: { "font-size": [{ text: DESK_TEXT }] } } });
