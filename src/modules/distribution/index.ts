// Server-side entry of the distribution module (Phase 5). Private: the desk and job code. The public side imports "./public" only.
import "server-only";

export { parseYoutubeUrl } from "./videos/youtube-url";
export { parseChapters, type ChaptersResult } from "./videos/chapters";
export { parseCaptions, type CaptionsResult } from "./videos/captions";
export { chaptersOf, initialVideoStructured, nextVideoStructured, transcriptText, VIDEO_SCHEMA, type VideoStructured } from "./videos/structured";
export { createVideoFiling, type VideoFiling } from "./videos/filing";
export { createSupabaseVideosRepo, segmentsOf, sourceFromRecord, type VideosRepo } from "./videos/repo";
export { addTranscript, CHANGE_REASON, applyChapters, applyTitle, applyTranscript, type VideoChange, type VideoDeps } from "./videos/service";
export { listVideoRows, type VideoListRow } from "./videos/list";
export { OFF_LINE, STALE_DAYS, videoChecks, videoStatus, type VideoCheck, type VideoFacts, type VideoStatus } from "./videos/status";
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

// Letters (Phase 5c, spec s8). The desk's actions import ./send-rpc directly (the one place the secret-key client is handed to this module);
// the ops steps build the same port from job code. The public pages import ./public only.
export { countCandidates, letterCandidates, toEntry } from "./letters/candidates";
export { CHANGED_AFTER_APPROVAL, deliverLetter, NO_CONFIRMED_READERS, runLetterSends, type DeliverDeps, type Delivery, type SendRun } from "./letters/deliver";
export { LETTER_ERROR_TEXT, LetterError, refusalCode, type LetterErrorCode } from "./letters/errors";
export { reconcileContacts, RECONCILE_BUDGET_MS, sendConfirmations, type ConfirmationBatch, type ReconcileResult } from "./letters/readers";
export { createPublicLetterSource, createSupabaseLettersReads } from "./letters/repo";
export { renderConfirmation, renderLetter, type RenderedLetter, type RenderOptions } from "./letters/render";
export { createLettersRpc } from "./letters/rpc";
export { approveSend, binRequests, cancelSend, eraseReader, makeLetter, saveLetter, setSignup, type LetterDeps, type LetterInput } from "./letters/service";
export { entriesOf, letterStructured, PAGE_PATH } from "./letters/structured";
export { listLetterRows, mondayLetterLine, publicRevisionIds, publicRevisionIdsNow, readCandidates, readCandidatesNow, type CandidateDeps, type CandidateRead, type LetterRow } from "./letters/desk-read";
export { letterScreen, type LetterScreen, type ScreenInput } from "./letters/screen";
export { isMondayInIndia, mondayLine } from "./letters/monday";
export { letterChecks, type LetterCheck, type LetterFacts } from "./letters/checks";
export { LABEL_LINE, listLine, NOT_PUBLISHED_LINE, sendState, testCopyLine, type LetterListRow, type SendFacts, type SendState } from "./letters/status";
export { isPlaceholderSubject, placeholderSubject } from "./letters/subject";
export { CONFIRMATIONS_PER_DAY, WAITING_CAP, KIND_LABEL, LETTERS_NOTICE_VERSION, POSITION_LABEL, POSITION_WORD } from "./letters/copy";
export {
  LETTER_SCHEMA, MAX_ENTRIES, MAX_NOTE, MAX_OBJECTIVE, MAX_SUBJECT,
  type Candidate, type EntryKind, type IssuedConfirmation, type LetterEntry, type LetterSource, type LettersReads, type LettersRpc, type LetterStructured,
  type LetterView, type ReaderCounts, type SendKind, type SendRow, type SendStatus, type WaitingReader,
} from "./letters/types";
