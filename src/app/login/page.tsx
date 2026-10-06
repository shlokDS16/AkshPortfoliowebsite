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
    <main className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {message ? (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      ) : null}
      <LoginForm />
    </main>
  );
}
