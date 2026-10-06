import type { Metadata } from "next";
import { DeskShell } from "@/components/desk/private/desk-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { signOut } from "@/modules/identity/actions";
import { getLiveness } from "@/modules/ops";
import { namesToReview } from "./desk-data";

export const metadata: Metadata = { title: "Desk", robots: { index: false, follow: false } };

export default async function DeskLayout({ children }: LayoutProps<"/desk">) {
  await requireAdmin();
  const [liveness, names] = await Promise.all([getLiveness(await createSupabaseServerClient()), namesToReview()]);
  return (
    <DeskShell names={names} liveness={liveness} signOut={signOut}>
      {children}
    </DeskShell>
  );
}
