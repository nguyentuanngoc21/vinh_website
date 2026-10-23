import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getMonthlyPostsTrend, getWeeklySignupsTrend } from "./get-content-trends";

function clientFor(timestamps: string[], cutoffs: string[]) {
  const query = {
    select: () => query,
    eq: () => query,
    gte: (_column: string, value: string) => { cutoffs.push(value); return query; },
    lte: () => query,
    order: () => query,
    range: async (from: number, to: number) => ({
      data: timestamps.slice(from, to + 1).map(created_at => ({ created_at })), error: null,
    }),
  };
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

afterEach(() => vi.useRealTimers());

describe("overview date windows", () => {
  it("uses exactly 30 days and includes both endpoints in five buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const cutoffs: string[] = [];
    const points = await getWeeklySignupsTrend(clientFor([
      "2026-09-22T12:00:00Z", "2026-09-29T12:00:00Z", "2026-10-22T12:00:00Z",
    ], cutoffs));
    expect(cutoffs.every(date => date === "2026-09-22T12:00:00.000Z")).toBe(true);
    expect(points.map(point => point.count)).toEqual([1, 1, 0, 0, 1]);
  });
  it("uses Vietnam's calendar month at a UTC month boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T18:00:00Z")); // October 1 in Vietnam.
    const cutoffs: string[] = [];
    const points = await getMonthlyPostsTrend(clientFor(["2026-09-30T17:30:00Z"], cutoffs));
    expect(points.at(-1)).toEqual({ label: "T10", chapters: 1, audio: 1 });
    expect(cutoffs[0]).toBe("2025-10-31T17:00:00.000Z");
  });
});
