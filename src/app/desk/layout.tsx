import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/identity";
import { signOut } from "@/modules/identity/actions";

export default async function DeskLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between gap-2 text-sm">
        <nav className="flex gap-4">
          <Link href="/desk">Today</Link>
          <Link href="/desk/items">Items</Link>
        </nav>
        <form action={signOut}>
          <Button type="submit" variant="link" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
