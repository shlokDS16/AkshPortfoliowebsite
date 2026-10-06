import { highlightCapture, type KnownTokens } from "@/modules/capture/client";
import { TOKEN_CLASS } from "./token-class";

/** A saved capture shown with the same colouring as while typing (Today tray). */
export function CaptureText({ raw, known }: { raw: string; known: KnownTokens }) {
  return (
    <>
      {highlightCapture(raw, known).map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  );
}
