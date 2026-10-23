/** Fetch every row, including when PostgREST caps responses below our page size. */
export async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await query(rows.length, rows.length + 499);
    if (error) throw new Error(`Không tải được thống kê: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export function checkQueryErrors(results: { error: { message: string } | null }[]) {
  for (const result of results) {
    if (result.error) throw new Error(`Không tải được thống kê: ${result.error.message}`);
  }
}
