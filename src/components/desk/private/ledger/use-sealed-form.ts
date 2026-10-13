"use client";

import { startTransition, useActionState, useSyncExternalStore, type FormEvent } from "react";
import type { FormState } from "@/modules/ledger/actions";

/**
 * Submits a ledger form through its server action without letting React reset the form afterwards. A form handed to
 * `<form action={fn}>` is reset when the action returns, and a refusal must leave what was typed and chosen exactly where it was
 * (a radio group and a select are not restored by React after that reset). The browser's own required-field checks still run
 * before `onSubmit`. `method="post"` on the form keeps a tap before the page is ready from putting his words in the address.
 * `ready` is false until the page's code is attached; the button stays off until then so nothing is submitted half-way.
 */
const subscribeNothing = (): (() => void) => () => {};

export function useSealedForm(action: (previous: FormState, data: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState(action, { error: null } as FormState);
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false); // false while rendering on the server and hydrating
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  return { state, pending, ready, onSubmit };
}
