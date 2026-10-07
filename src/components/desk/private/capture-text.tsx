import { highlightCapture, type KnownTokens } from "@/modules/capture/client";
import { cn } from "@/lib/utils";
import { CHIP_PAD, TOKEN_CLASS } from "./token-class";

/** A saved capture shown with the same colouring as while typing (Today tray); chips get inline padding here only (M7). */
export function CaptureText({ raw, known }: { raw: string; known: KnownTokens }) {
  return (
    <>
      {highlightCapture(raw, known).map((t, i) => (
        <span key={i} className={cn(TOKEN_CLASS[t.kind], CHIP_PAD[t.kind])}>
          {t.text}
        </span>
      ))}
    </>
  );
}
