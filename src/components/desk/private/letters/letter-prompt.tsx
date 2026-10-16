import Link from "next/link";

/** The desk home's Monday prompt (spec s8.1 step 1, D84): a prompt, not a schedule. It makes nothing; the link opens the list he chooses from. */
export function LetterPrompt({ line }: { line: string | null }) {
  if (line === null) return null;
  return (
    <p className="text-small text-ink">
      <Link href="/desk/letters/new" className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-3">
        {line}
      </Link>
    </p>
  );
}
