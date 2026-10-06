import { cn } from "@/lib/utils";
import type { BodySegment } from "@/modules/compliance/client";

/** The flagged sentence (B): wavy --bad underline, matched words bold --bad, superscript rule number. */
export function GatedSentence({ segment, first = false }: { segment: BodySegment; first?: boolean }) {
  const { flag, allowed, text } = segment;
  if (!flag && !allowed) return <>{text}</>;
  if (!flag) return <span className="underline decoration-dotted decoration-1 underline-offset-3">{text}</span>;
  const at = flag.match ? text.toLowerCase().indexOf(flag.match.toLowerCase()) : -1;
  return (
    <span
      id={first ? "first-flag" : undefined}
      tabIndex={first ? -1 : undefined}
      data-testid="preview-flag"
      className={cn("underline decoration-wavy decoration-bad decoration-1 underline-offset-4 outline-offset-2 focus:outline-2 focus:outline-bad")}
    >
      {at >= 0 && flag.match ? (
        <>
          {text.slice(0, at)}
          <strong className="font-semibold text-bad">{text.slice(at, at + flag.match.length)}</strong>
          {text.slice(at + flag.match.length)}
        </>
      ) : (
        text
      )}
      <sup className="ml-0.5 font-mono text-mono-label text-bad">{flag.rule}</sup>
    </span>
  );
}
