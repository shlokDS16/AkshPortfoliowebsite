/** One slice of reading, asked of the pump route (a plain POST, so it never queues behind the screen's own actions). */
export async function fetchSlice(): Promise<{ more: boolean }> {
  const res = await fetch("/desk/inbox/pump", { method: "POST", credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return { more: false };
  const body: unknown = await res.json();
  return { more: typeof body === "object" && body !== null && "more" in body && body.more === true };
}
