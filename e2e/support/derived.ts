import { test, type APIRequestContext } from "@playwright/test";
import { E2E_SITE_URL } from "./stack";

// Plan 5a Task 4. What the derived public surfaces (sitemap, feed, robots, metadata, structured data, share cards, print) must show in each
// of the four states the e2e run passes through. The state is told by the Playwright project, never by what the database holds (a check
// decided by the data cannot fail in the case it exists for):
//  - deploy: the public-* projects, before any loop: two files and three notes are public; no case, no concept.
//  - a case is public: the cases-public-* projects, after the cases loop (the concepts loop may or may not have run yet).
//  - concepts are public: the concepts-public-* projects, after the concepts loop (which runs after the cases loop).
//  - a video is listed: the videos-public-* projects, after the videos loop (which runs after the concepts loop and leaves one video public).
export const SITE = E2E_SITE_URL;
export const STATIC_PATHS = ["/", "/companies", "/notes", "/process", "/about"] as const;

export function state() {
  const name = test.info().project.name;
  const videosPublic = name.startsWith("videos-public");
  const conceptsPublic = videosPublic || name.startsWith("concepts-public");
  return { deploy: name.startsWith("public-"), casePublic: conceptsPublic || name.startsWith("cases-public"), conceptsPublic, videosPublic };
}

export type Pages = { files: string[]; notes: string[]; process: string[]; cases: string[]; concepts: string[]; videos: string[] };

/** Every public detail page, read from the live index pages the way a visitor finds them. An index that answers 404 has none. */
export async function discover(request: APIRequestContext): Promise<Pages> {
  const links = async (index: string, prefix: string) => {
    const response = await request.get(index);
    if (response.status() === 404) return [];
    const html = await response.text();
    return [...new Set([...html.matchAll(new RegExp(`href="(${prefix}/[a-z0-9-]+)"`, "g"))].map((m) => m[1]))].sort();
  };
  return {
    files: await links("/companies", "/companies"),
    notes: await links("/notes", "/notes"),
    process: await links("/process", "/process"),
    cases: await links("/cases", "/cases"),
    concepts: await links("/concepts", "/concepts"),
    videos: await links("/videos", "/videos"),
  };
}

/**
 * The paths a sitemap must list: the static routes, the index pages that exist (/cases and /mistakes once a case is public, /concepts once
 * a concept is; the index answers 404 before), and every detail page found above. What exists is read from the live pages, so the order
 * in which the cases and concepts loops ran cannot matter; that each state holds what it should is a separate check (state()).
 */
export function expectedSitemapPaths(pages: Pages): string[] {
  return [
    ...STATIC_PATHS,
    ...(pages.cases.length > 0 ? ["/cases", "/mistakes"] : []),
    ...(pages.concepts.length > 0 ? ["/concepts"] : []),
    ...(pages.videos.length > 0 ? ["/videos"] : []),
    ...pages.files, ...pages.notes, ...pages.process, ...pages.cases, ...pages.concepts, ...pages.videos,
  ].sort();
}

const FEED_DATE = /^[A-Za-z]+, \d{2} [A-Z][a-z]{2} \d{4} 00:00:00 \+0530$/;
/** RFC 822 date as the feed prints it: day precision, India time. */
export const isFeedDate = (value: string | null | undefined): boolean => FEED_DATE.test(value ?? "");
