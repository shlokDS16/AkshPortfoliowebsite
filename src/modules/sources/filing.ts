import type { SourcesRepo } from "./repo";
import { saveSource } from "./service";
import { cleanSourceUrl } from "./url-key";

/**
 * What the capture module needs to file an `s:` capture, handed to it by the capture action (the capture module's service is reachable
 * from the public pages, which may import nothing of this module but its public entry, so it takes these as an argument and imports none
 * of it). The same shape as capture's own `SourceFiling` interface.
 */
export type SourceFiling = {
  /** The link as it would be saved (trimmed, http upgraded to https), or null when it is not a link a source can be. */
  parseLink(url: string): string | null;
  /** Saves the link with his note and the companies and concepts, or adds them to the link he saved before. */
  save(input: { url: string; note: string; companyIds: string[]; themeIds: string[] }): Promise<{ id: string; answer: string; duplicate: boolean }>;
};

export function createSourceFiling(repo: SourcesRepo, now: () => Date = () => new Date()): SourceFiling {
  return {
    parseLink: cleanSourceUrl,
    async save(input) {
      const saved = await saveSource(repo, input, now());
      return { id: saved.id, answer: saved.answer, duplicate: saved.duplicate };
    },
  };
}
