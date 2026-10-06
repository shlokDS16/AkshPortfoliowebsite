import { addDays, istDate, istDayStartUtc } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureStreak, groupTodayByCompany, listCapturesSince, type CaptureListEntry } from "@/modules/capture";
import { requireAdmin } from "@/modules/identity";
import { CaptureBox } from "./capture-box";
import { StreakStrip } from "./streak-strip";
import { TodayList } from "./today-list";

async function recentCaptures(today: string): Promise<CaptureListEntry[] | null> {
  try {
    return await listCapturesSince(await createSupabaseServerClient(), istDayStartUtc(addDays(today, -29)));
  } catch (error) {
    // Name only: a database message can carry row data.
    console.error("desk home: could not load captures", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

export default async function DeskHome() {
  await requireAdmin();
  const today = istDate(new Date());
  const entries = await recentCaptures(today);
  // The box always renders (spec s9: never a blank form), even when the list could not be read.
  return (
    <div className="space-y-6">
      <CaptureBox />
      {entries === null ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Could not load today&apos;s captures. New captures are still saved; reload to try again.
        </p>
      ) : (
        <>
          <StreakStrip streak={captureStreak(entries.map((e) => istDate(e.createdAt)), today)} />
          <TodayList groups={groupTodayByCompany(entries, today)} />
        </>
      )}
    </div>
  );
}
