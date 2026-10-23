import { describe, expect, it } from "vitest";
import { exposureTotals } from "./wallet-exposure";
import { fetchAllRows } from "./query-utils";

describe("wallet exposure", () => {
  it("includes in-flight withdrawals once, preserving their booked exchange rate", () => {
    expect(exposureTotals({ available: 1000, pending: 200, processing: 500, processingVnd: 90000 }))
      .toEqual({ tokens: 1700, vnd: 330000, availableAndProcessingVnd: 290000 });
  });
  it("handles an empty system", () => {
    expect(exposureTotals({ available: 0, pending: 0, processing: 0, processingVnd: 0 }).vnd).toBe(0);
  });
});

describe("statistics pagination", () => {
  it("continues beyond the API row cap, even when lower than requested page size", async () => {
    const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const rows = await fetchAllRows(async (from) => ({ data: source.slice(from, from + 100), error: null }));
    expect(rows).toEqual(source);
  });
  it("fails rather than returning partial totals when a later page errors", async () => {
    await expect(fetchAllRows(async (from) => from === 0
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: { message: "timeout" } })).rejects.toThrow("timeout");
  });
});
