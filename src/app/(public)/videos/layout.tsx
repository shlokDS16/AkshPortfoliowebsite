import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";

// Phase 5d (spec s8): while the own-channel videos are off, /videos and every video page are a 404. Nothing under it is deleted.
export default function VideosLayout({ children }: LayoutProps<"/videos">) {
  if (!featureOn("ownVideos")) notFound();
  return children;
}
