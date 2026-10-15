import { parseYoutubeUrl } from "./youtube-url";
import type { VideosRepo } from "./repo";
import { initialVideoStructured } from "./structured";

/**
 * What the capture module needs to file a `v:` capture, handed to it by the action (the capture module's service is reachable from the
 * public pages, which may import nothing of distribution but its public entry, so it takes these as an argument and imports none of it).
 */
export type VideoFiling = {
  /** The eleven-character id in a YouTube video address, or null. */
  parseLink(url: string): string | null;
  /** The first revision's record: schema, id, empty chapters. */
  initialStructured(youtubeId: string): Record<string, unknown>;
  findByYoutubeId(youtubeId: string): Promise<{ itemId: string } | null>;
  insertSource(itemId: string, youtubeId: string): Promise<unknown>;
};

export function createVideoFiling(repo: Pick<VideosRepo, "findByYoutubeId" | "insertSource">): VideoFiling {
  return {
    parseLink: parseYoutubeUrl,
    initialStructured: (youtubeId) => ({ ...initialVideoStructured(youtubeId) }),
    findByYoutubeId: async (youtubeId) => {
      const found = await repo.findByYoutubeId(youtubeId);
      return found ? { itemId: found.itemId } : null;
    },
    insertSource: (itemId, youtubeId) => repo.insertSource(itemId, youtubeId),
  };
}
