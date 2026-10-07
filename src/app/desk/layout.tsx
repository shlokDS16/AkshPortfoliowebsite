import type { Metadata } from "next";
import { CaptureDock } from "@/components/desk/private/capture-dock";
import { DeskShell } from "@/components/desk/private/desk-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { signOut } from "@/modules/identity/actions";
import { getLiveness } from "@/modules/ops";
import { knownTokens, namesToReview } from "./desk-data";

export const metadata: Metadata = { title: "Desk", robots: { index: false, follow: false } };

export default async function DeskLayout({ children }: LayoutProps<"/desk">) {
  await requireAdmin();
  const [liveness, names, known] = await Promise.all([getLiveness(await createSupabaseServerClient()), namesToReview(), knownTokens()]);
  return (
    <DeskShell names={names} liveness={liveness} signOut={signOut} capture={<CaptureDock known={known} />}>
      {children}
    </DeskShell>
  );
}
