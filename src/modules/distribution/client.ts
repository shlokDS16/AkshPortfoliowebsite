// Browser-safe entry of the distribution module: pure parsing and shapes only. No server-only import, no database, no node API.
// The capture box checks the link with it as he types; the desk previews chapters with it.
export { parseYoutubeUrl } from "./videos/youtube-url";
export { parseChapters, type ChaptersResult } from "./videos/chapters";
export type { Chapter, Segment } from "./videos/types";
