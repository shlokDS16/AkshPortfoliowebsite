import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTE, MAX_OBJECTIVE, MAX_SUBJECT } from "@/modules/distribution";
import { PendingButton } from "../pending-button";

type Props = {
  action: (formData: FormData) => Promise<void>;
  subject: string;
  objective: string;
  note: string;
  /** The subject is still the label the desk gave a new letter. */
  subjectIsLabel: boolean;
  /** `public`: on the archive, so the subject and the sentence are frozen; `sent`: nothing can change. */
  mode: "open" | "public" | "sent";
};

const LABEL_NOTE = "This is only a label the desk gave. Replace it with your own subject. A letter cannot be sent while it says this.";

/** His three fields (spec s8.1 step 3): stored as typed, never changed by the desk. A new letter's subject is a label he must replace. */
export function LetterFields({ action, subject, objective, note, subjectIsLabel, mode }: Props) {
  const frozenMeta = mode !== "open";
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="letter-subject">Subject</Label>
        <Input
          id="letter-subject"
          name="subject"
          defaultValue={subject}
          maxLength={MAX_SUBJECT}
          readOnly={frozenMeta}
          required
          aria-describedby={subjectIsLabel ? "letter-subject-label" : undefined}
        />
        {subjectIsLabel ? (
          <p id="letter-subject-label" className="rounded-sm border border-warn bg-warn-wash px-3 py-1.5 text-small text-ink">
            {LABEL_NOTE}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="letter-objective">One sentence: what a reader learns</Label>
        <Input id="letter-objective" name="objective" defaultValue={objective} maxLength={MAX_OBJECTIVE} readOnly={frozenMeta} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="letter-note">A short note (optional)</Label>
        <Textarea id="letter-note" name="note" defaultValue={note} maxLength={MAX_NOTE} readOnly={mode === "sent"} />
      </div>
      {mode === "public" ? <p className="text-small text-ink-muted">This letter is on the archive. Unpublish it to change the subject or the sentence.</p> : null}
      {mode === "sent" ? <p className="text-small text-ink-muted">This letter was sent. It cannot be changed.</p> : <PendingButton>Save</PendingButton>}
    </form>
  );
}
