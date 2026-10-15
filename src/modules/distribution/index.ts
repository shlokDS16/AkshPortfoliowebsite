// Server-side entry of the distribution module (Phase 5). Private: the desk and job code. The public side imports "./public" only.
import "server-only";

export { parseYoutubeUrl } from "./videos/youtube-url";
export { parseChapters, type ChaptersResult } from "./videos/chapters";
export { parseCaptions, type CaptionsResult } from "./videos/captions";
export { initialVideoStructured, nextVideoStructured, transcriptText, VIDEO_SCHEMA, type VideoStructured } from "./videos/structured";
export { createVideoFiling, type VideoFiling } from "./videos/filing";
export { createSupabaseVideosRepo, segmentsOf, sourceFromRecord, type VideosRepo } from "./videos/repo";
export { addTranscript, CHANGE_REASON, applyChapters, applyTitle, applyTranscript, type VideoChange, type VideoDeps } from "./videos/service";
export { VIDEO_ERROR_TEXT, VideoError, type VideoErrorCode } from "./videos/errors";
export {
  checkVideos,
  fetchPendingVideos,
  fetchVideoNow,
  QUOTA_DEFERRED,
  VIDEOS_OFF,
  VIDEOS_OFF_TEXT,
  type FetchDeps,
  type FetchStore,
  type RecordFetch,
  type SourceRef,
} from "./videos/fetch";
export type { Chapter, Segment, TranscriptRow, VideoPrivacy, VideoSourceRow } from "./videos/types";
