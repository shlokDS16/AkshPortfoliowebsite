"use client";

import { Play } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { embedUrl, watchUrl } from "@/modules/distribution/public";
import type { VideoChapter } from "@/modules/showcase";

type Props = { youtubeId: string; title: string; thumbnail: string; durationLabel: string | null; chapters: VideoChapter[] };

/**
 * Spec s7.7, D79: a click-to-load player. Until the press the page holds a still image (a plain img with its size) and a button, and loads
 * nothing else from YouTube: no iframe, no script. The press mounts one privacy-enhanced (youtube-nocookie) frame in the same 16:9 box, so
 * nothing moves. A chapter is a link to its place on YouTube that, once this script has run, starts the frame at that second instead
 * (the frame is reloaded with `start=`; no postMessage). The chapter list is also here because it drives the frame; it prints, the player does not.
 */
export function VideoPlayer({ youtubeId, title, thumbnail, durationLabel, chapters }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const src = start === null ? null : embedUrl(youtubeId, start);

  // Keyboard and screen-reader users pressed a button that is now gone: the frame takes their place.
  useEffect(() => {
    if (src !== null) frame.current?.focus();
  }, [src]);

  const play = (at: number) => {
    setStart(at);
    box.current?.scrollIntoView({ block: "nearest" });
  };
  const onChapter = (event: MouseEvent<HTMLAnchorElement>, at: number) => {
    // A new tab, a download or a copy of the address keeps the ordinary link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    play(at);
  };

  return (
    <div>
      <div data-player className="mt-(--block-gap) print:hidden">
        <div ref={box} data-player-box className="relative aspect-video w-full overflow-hidden border border-rule bg-surface">
          {src ? (
            <iframe
              ref={frame}
              key={src}
              src={src}
              title={`${title} (YouTube video)`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 size-full border-0"
            />
          ) : (
            <>
              {/* A third-party still that must stay a plain img (spec s7.7): next/image would route it through this server. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnail} alt="" width={480} height={360} referrerPolicy="no-referrer" decoding="async" className="absolute inset-0 size-full object-cover" />
              <button
                type="button"
                onClick={() => play(0)}
                className="absolute inset-x-0 bottom-0 flex min-h-11 w-full items-center gap-2 border-t border-ink bg-ink px-4 text-left text-body font-medium text-paper"
              >
                <Play aria-hidden strokeWidth={1.5} className="size-4 shrink-0 fill-current" />
                Play video (loads YouTube)
                {durationLabel ? <span className="ml-auto font-mono text-mono-tag tabular-nums">{durationLabel}</span> : null}
              </button>
            </>
          )}
        </div>
      </div>
      {chapters.length > 0 ? (
        <section aria-labelledby="chapters-heading" className="mt-(--block-gap)">
          <h2 id="chapters-heading" data-section className="text-title text-ink desk:text-title-desk">
            Chapters
          </h2>
          <ol aria-labelledby="chapters-heading" className="mt-3 divide-y divide-rule border-y border-rule">
            {chapters.map((c) => (
              <li key={c.s} id={`chapter-${c.s}`}>
                <a
                  href={watchUrl(youtubeId, c.s) ?? "#"}
                  onClick={(event) => onChapter(event, c.s)}
                  className="grid min-h-11 grid-cols-[4.25rem_1fr] items-center gap-x-3 py-2 text-body text-ink no-underline hover:bg-surface-2"
                >
                  <span data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
                    {c.clock}
                  </span>
                  <span>{c.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
