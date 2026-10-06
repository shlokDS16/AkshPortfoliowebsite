import { requireAdmin } from "@/modules/identity";

// Task 12 replaces this with the capture screen.
export default async function DeskHome() {
  const admin = await requireAdmin();
  return <p className="text-sm">Signed in as {admin.email}.</p>;
}
