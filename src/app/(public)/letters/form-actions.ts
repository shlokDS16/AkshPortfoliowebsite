"use server";

import { redirect } from "next/navigation";
import { askToSubscribeAction, confirmAction, leaveAction } from "@/modules/distribution/public-actions";

// The three plain forms of the letters pages post here (spec s8.5, s8.9). Each wraps ONE reader action from public-actions.ts, the only
// distribution file with a server action that the public side may import (it reaches the cookie-less client and the form ticket, never the
// admin session or the secret-key client), and then redirects, so the page after a post is an ordinary GET and the form needs no script.
// The address a reader types is never put in a URL. The answer is one sentence per door and the same whatever happened: a post that was trapped,
// too fast, refused by the database or already known ends at the same place as one that was kept.

export async function askForm(formData: FormData): Promise<void> {
  await askToSubscribeAction({ status: "idle" }, formData);
  redirect("/letters?asked=1#subscribe");
}

export async function confirmForm(formData: FormData): Promise<void> {
  const result = await confirmAction({ status: "idle" }, formData);
  redirect(`/letters/confirm?r=${result.status === "confirmed" ? "confirmed" : "expired"}`);
}

export async function leaveForm(formData: FormData): Promise<void> {
  await leaveAction({ status: "idle" }, formData);
  redirect("/letters/leave?r=left");
}
