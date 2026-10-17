import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";

// Phase 5d (spec s8): while the letters are off, /letters, its sign-up, confirm and leave pages and every letter are a 404. Nothing under it is deleted.
export default function LettersLayout({ children }: LayoutProps<"/letters">) {
  if (!featureOn("letters")) notFound();
  return children;
}
