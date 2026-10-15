import { cn } from "@/lib/utils";
import type { VideoStatus } from "@/modules/distribution";

const TONE: Record<VideoStatus["tone"], string> = {
  ok: "border-rule-strong text-ink",
  warn: "border-warn bg-warn-wash text-ink",
  bad: "border-bad bg-bad-wash text-ink",
  muted: "border-transparent px-0 text-ink-muted",
};

/** One status in words (spec s7.6). The tone is a border and a wash on top of the sentence, never the only signal. `long` is the page's sentence, the default the list's. */
export function VideoStatusLine({ status, long = false }: { status: VideoStatus; long?: boolean }) {
  return (
    <p role="status" className={cn("rounded-sm border px-3 py-1.5 text-small", TONE[status.tone])}>
      {long ? status.detail : status.line}
    </p>
  );
}
