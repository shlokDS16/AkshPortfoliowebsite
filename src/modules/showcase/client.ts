// The cache-free entry of the showcase module, for other modules (Phase 5c, the letters). Everything here is a function of a public
// snapshot, or reads one through a client the CALLER passes in: no next/cache, no environment, no secret. The server entry (index.ts)
// also builds the cached snapshot (unstable_cache) at import, so code that only wants to describe a revision the way "What changed" does,
// or to read the public site fresh, imports this instead and does not drag the cache with it.
export { createSupabaseShowcaseRepo, loadSnapshot } from "./repo";
export { describeRevision, files as publicFiles, ordinal as publicOrdinal, servedFiles } from "./site";
export { listedVideos } from "./video-list";
export { caseHref, ledgerCases } from "./case-study";
