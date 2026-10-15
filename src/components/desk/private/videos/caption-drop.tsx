import { PendingButton } from "../pending-button";

/**
 * Spec s7.1 step 4: the caption file from YouTube Studio. One field and one button; the file is parsed to text by the server and stored as the
 * machine's record. Nothing from the form but the file is read, and the transcript is never edited anywhere.
 */
export function CaptionDrop({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-2 rounded-sm border border-dashed border-rule-strong p-3">
      <label htmlFor="caption-file" className="block text-small font-medium text-ink">
        Drop the caption file from YouTube Studio (.vtt or .srt).
      </label>
      <input
        id="caption-file"
        type="file"
        name="file"
        accept=".vtt,.srt"
        required
        className="block min-h-11 w-full text-small text-ink file:mr-3 file:min-h-11 file:rounded-sm file:border file:border-rule-strong file:bg-paper file:px-3 file:text-body file:font-medium file:text-ink"
      />
      <PendingButton variant="outline" size="sm">
        Store transcript
      </PendingButton>
    </form>
  );
}
