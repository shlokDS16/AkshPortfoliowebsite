import { errorText, noticeText } from "@/lib/messages";

/** The fixed error and notice a desk action redirected back with (a code, never free text). Unknown codes show nothing. */
export function Flash({ error, notice }: { error?: string; notice?: string }) {
  const bad = errorText(error);
  const good = noticeText(notice);
  return (
    <>
      {bad ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {bad}
        </p>
      ) : null}
      {good ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {good}
        </p>
      ) : null}
    </>
  );
}
