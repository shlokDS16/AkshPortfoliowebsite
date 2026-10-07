import type { BodySegment } from "@/modules/compliance/client";
import { splitAtMatch } from "./match-split";

/** The flagged sentence (B): wavy --bad underline, matched words bold --bad, superscript rule number. */
export function GatedSentence({ segment }: { segment: BodySegment }) {
  const { flag, allowed, text } = segment;
  if (!flag && !allowed) return <>{text}</>;
  if (!flag) return <span className="underline decoration-dotted decoration-1 underline-offset-3">{text}</span>;
  const split = splitAtMatch(text, flag.match);
  return (
    <span data-testid="preview-flag" className="underline decoration-wavy decoration-bad decoration-1 underline-offset-4">
      {split ? (
        <>
          {split.before}
          <strong className="font-semibold text-bad">{split.hit}</strong>
          {split.after}
        </>
      ) : (
        text
      )}
      <sup className="ml-0.5 font-mono text-mono-label text-bad">{flag.rule}</sup>
    </span>
  );
}
