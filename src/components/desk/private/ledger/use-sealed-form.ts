"use client";

import { startTransition, useActionState, useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import type { FormState } from "@/modules/ledger/actions";

/**
 * Submits a ledger form through its server action without letting React reset the form afterwards. A form handed to
 * `<form action={fn}>` is reset when the action returns, and a refusal must leave what was typed and chosen exactly where it was
 * (a radio group and a select are not restored by React after that reset). The browser's own required-field checks still run
 * before `onSubmit`. `method="post"` on the form keeps a tap before the page is ready from putting his words in the address.
 * `ready` is false until the page's code is attached; the button stays off until then so nothing is submitted half-way.
 * While a submit is running the button is `aria-disabled` (never `disabled`, which can drop keyboard focus) and a second press
 * is ignored here: the guard is a ref, so two presses inside one render still send one request.
 */
const subscribeNothing = (): (() => void) => () => {};

export function useSealedForm<S extends FormState = FormState>(action: (previous: S, data: FormData) => Promise<S>, initial: S = { error: null } as S) {
  const [awaited, formAction, pending] = useActionState(action as unknown as (previous: Awaited<S>, data: FormData) => Promise<Awaited<S>>, initial as Awaited<S>);
  const state = awaited as S;
  const send = formAction as unknown as (data: FormData) => void;
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false); // false while rendering on the server and hydrating
  const sending = useRef(false);
  useEffect(() => {
    if (!pending) sending.current = false;
  }, [pending, state]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || sending.current) return;
    sending.current = true;
    const data = new FormData(event.currentTarget);
    startTransition(() => send(data));
  };
  return { state, pending, ready, onSubmit };
}
