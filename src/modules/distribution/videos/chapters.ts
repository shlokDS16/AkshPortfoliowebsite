import { MAX_CHAPTER_TITLE, MAX_CHAPTERS, type Chapter } from "./types";

// His chapters, read from his own YouTube description (spec s7.5): lines of the form `[H:]MM:SS title`, as YouTube itself reads them.
// The title is copied exactly as typed after the time (only the line's outer spaces go): the desk never shortens or re-words it. A
// list that YouTube would not accept, or that the gate would refuse (migration 0023, rule 12.4), is not returned; the reason is shown to him.

export type ChaptersResult = { chapters: Chapter[]; reason: string | null };

const LINE = /^[ \t]*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[ \t]+(\S.*?)[ \t]*$/;
export const NEED_THREE = "YouTube chapters need at least 3 lines that start with a time.";

const none = (reason: string): ChaptersResult => ({ chapters: [], reason });

export function parseChapters(description: string): ChaptersResult {
  const found: Chapter[] = [];
  for (const line of description.split(/\r\n|\r|\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const hours = m[1] === undefined ? null : Number(m[1]);
    const minutes = Number(m[2]);
    const seconds = Number(m[3]);
    // 1:75 is not a time. With an hour part the minutes are also under 60.
    if (seconds > 59 || (hours !== null && minutes > 59)) continue;
    found.push({ s: (hours ?? 0) * 3600 + minutes * 60 + seconds, title: m[4] as string });
  }
  if (found.length < 3) return none(NEED_THREE);
  if (found.length > MAX_CHAPTERS) return none(`A video can have at most ${MAX_CHAPTERS} chapters.`);
  if (found[0]?.s !== 0) return none("The first chapter must start at 0:00.");
  if (found.some((c, i) => i > 0 && c.s <= (found[i - 1] as Chapter).s)) return none("Chapter times must rise.");
  if (found.some((c) => c.title.length > MAX_CHAPTER_TITLE)) return none(`A chapter title is longer than ${MAX_CHAPTER_TITLE} characters.`);
  return { chapters: found, reason: null };
}
