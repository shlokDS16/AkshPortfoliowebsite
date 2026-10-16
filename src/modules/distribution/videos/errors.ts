import { DeskError } from "@/lib/errors";
import { CAPTION_FILE_TOO_BIG, CAPTION_FILE_TOO_LONG, NOT_A_CAPTION_FILE } from "./captions";

/**
 * Fixed text per code, equal to the entries in src/lib/messages.ts (a test keeps them equal). A message never carries data: not the
 * YouTube title, not a caption line, not a reason from YouTube. Every sentence here is pending Shlok's approval (the task report lists them).
 */
export const VIDEO_ERROR_TEXT = {
  "video-not-found": "This video could not be found.",
  "video-off": "Video listing is not set up yet (Shlok adds a YouTube key).",
  "video-no-transcript": "There is no transcript yet. Drop the caption file from YouTube Studio first.",
  "video-no-yt-data": "YouTube has not answered for this video yet. Fetch again first.",
  "video-no-chapters": "The YouTube description has no chapter list that YouTube would accept: at least 3 lines that start with a time, the first at 0:00.",
  "video-captions-invalid": NOT_A_CAPTION_FILE,
  "video-captions-too-big": CAPTION_FILE_TOO_BIG,
  "video-captions-too-long": CAPTION_FILE_TOO_LONG,
  "video-fetch-busy": "A fetch is already running. Wait for it to finish, then reload this page.",
} as const;

export type VideoErrorCode = keyof typeof VIDEO_ERROR_TEXT;

export class VideoError extends DeskError {
  readonly code: VideoErrorCode;
  constructor(code: VideoErrorCode) {
    super(VIDEO_ERROR_TEXT[code]);
    this.code = code;
    this.name = "VideoError";
  }
}

/** The caption parser's refusal sentence as the error code that shows the same words. */
export function captionsErrorCode(reason: string): VideoErrorCode {
  if (reason === CAPTION_FILE_TOO_BIG) return "video-captions-too-big";
  if (reason === CAPTION_FILE_TOO_LONG) return "video-captions-too-long";
  return "video-captions-invalid";
}
