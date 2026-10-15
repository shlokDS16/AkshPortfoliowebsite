/** PostgREST answers at most 1000 rows to one request; a read that may pass that asks page by page, in a stable order. */
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null };

/** Reads every page until a short one. Returns the first error as it came, so the caller wraps it in its own typed error. */
export async function readAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<{ data: T[]; error: null } | { data: null; error: NonNullable<PageResult<T>["error"]> }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}
