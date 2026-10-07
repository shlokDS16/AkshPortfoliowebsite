"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMagicLink, type MagicLinkState } from "@/modules/identity/actions";

const initial: MagicLinkState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(requestMagicLink, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send sign-in link"}
      </Button>
      <p role="status" className="text-small text-ink-body">
        {state.message}
      </p>
    </form>
  );
}
