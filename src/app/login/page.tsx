import Link from "next/link";
import { Wordmark } from "@/components/desk/wordmark";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message =
    error === "not-allowed"
      ? "That account is not allowed into the desk."
      : error
        ? "That sign-in link did not work. Request a new one."
        : null;
  return (
    <main id="main" className="mx-auto max-w-sm px-(--gutter) py-16">
      <Link href="/" className="no-underline">
        <Wordmark />
      </Link>
      <h1 className="mt-8 text-display text-ink desk:text-display-desk">Sign in</h1>
      <p className="mt-2 text-body text-ink-body">The desk is private. Enter your email to get a sign-in link.</p>
      {message ? (
        <p role="alert" className="mt-4 border-l-2 border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {message}
        </p>
      ) : null}
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-6 border-t border-rule pt-4 text-small text-ink-muted">
        The sign-in link only works in the browser that requested it. Open it on this device, in this browser.
      </p>
    </main>
  );
}
