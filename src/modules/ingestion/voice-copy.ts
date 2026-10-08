// The words about voice notes (browser-safe: the trays show them). Every line is also in spec s16.9, marked there as
// pending Shlok approval where the build chose the wording and he has not yet read it.

/** The same sentence as the `voice-off` message code (src/lib/messages.ts); a test keeps them equal. */
export const VOICE_OFF = "Voice notes are not switched on yet.";
export const VOICE_NOT_STORED = "This voice note is no longer stored, so it cannot be typed out. Choose Skip, or Try again.";
export const VOICE_NOTHING_HEARD = "Nothing could be heard in this recording. Skip it, or try another one.";
export const VOICE_TOO_BIG = "This voice note is over 25 MB, more than the free voice reading takes. Skip it, or record a shorter one.";

/** What a voice note's tray says while it is typed out and once it is (R13: it is not counted as figures). */
export const TYPING_OUT = "Typing out your voice note.";
export const TRANSCRIPT_READY = "Your voice note is typed out. Check it, then save it as a capture.";

/** The sentences a transcribe step stores for itself; the tray shows them as they are. */
export const VOICE_ATTENTION_TEXT: readonly string[] = [VOICE_OFF, VOICE_NOT_STORED, VOICE_NOTHING_HEARD, VOICE_TOO_BIG];
