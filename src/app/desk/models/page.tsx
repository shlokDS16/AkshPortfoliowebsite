import { ModelsList } from "@/components/desk/private/models/models-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { listModels } from "@/modules/valuation";

// /desk/models (Plan 2.7 Task 3, spec s7.1): the list of models. Admin only (the desk layout checks too, and keeps it out of search).

export default async function ModelsPage() {
  await requireAdmin();
  let rows;
  try {
    rows = await listModels(await createSupabaseServerClient());
  } catch (error) {
    // Name only: a database message can carry row data.
    console.error("models: could not load", error instanceof Error ? error.name : typeof error);
    return (
      <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
        Could not load your models. Your workbooks and scenarios are safe; reload to try again.
      </p>
    );
  }
  return <ModelsList rows={rows} />;
}
