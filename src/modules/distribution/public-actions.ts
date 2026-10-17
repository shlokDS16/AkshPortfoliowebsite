"use server";

import { featureOn } from "@/lib/features";
import { checkFormTicket } from "@/lib/letters-form";
import { jobDbError } from "@/lib/supabase/errors";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { askToSubscribe, confirmSubscription, leaveLetters, type AskState, type ConfirmState, type LeaveState } from "./letters/signup";

// The reader's three doors, as server actions (spec s8.5). Public: no admin, no session, no secret-key client. Each calls ONE database
// function through the cookie-less anon client; those functions (migration 0024) take or refuse silently, cap the day and never say which,
// so this file cannot become a way to find out whether an address is on the list. Kept apart from actions.ts, which holds the desk's
// writes: importing this file reaches neither the admin session nor the job code.
//
// The form's ticket and honeypot are a speed bump for scripts that post the HTML form, NOT a control: the publishable key is in every page,
// so letters_request and letters_leave can be called without the form. The SQL caps (migration 0024) are the control, and the desk shows the
// typed leaves of the day (readers page). Review findings 2 and 12.

// Phase 5d (spec s8): while the letters are off each door answers the same sentence it always gives and calls nothing (no database, no ticket), so a
// post that still reaches it (a stale form, a script) is kept nowhere and learns nothing.
export async function askToSubscribeAction(_previous: AskState, formData: FormData): Promise<AskState> {
  if (!featureOn("letters")) return { status: "asked" };
  const db = createSupabasePublicClient();
  return askToSubscribe(
    {
      ticketOk: (ticket) => checkFormTicket(ticket),
      async request(email, noticeVersion, adult) {
        const { error } = await db.rpc("letters_request", { p_email: email, p_notice_version: noticeVersion, p_adult: adult });
        if (error) throw jobDbError("letters.request", error);
      },
    },
    { email: formData.get("email"), adult: formData.get("adult"), ticket: formData.get("ticket"), website: formData.get("website") },
  );
}

/** The confirm page's button: a POST from a person. A GET of the link confirms nothing. */
export async function confirmAction(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!featureOn("letters")) return { status: "expired" };
  const db = createSupabasePublicClient();
  return confirmSubscription(
    {
      async confirm(token) {
        const { data, error } = await db.rpc("letters_confirm", { p_token: token });
        if (error) throw jobDbError("letters.confirm", error);
        return data === true;
      },
    },
    formData.get("token"),
  );
}

export async function leaveAction(_previous: LeaveState, formData: FormData): Promise<LeaveState> {
  if (!featureOn("letters")) return { status: "left" };
  const db = createSupabasePublicClient();
  return leaveLetters(
    {
      async leave(email) {
        const { error } = await db.rpc("letters_leave", { p_email: email });
        if (error) throw jobDbError("letters.leave", error);
      },
    },
    formData.get("email"),
  );
}
