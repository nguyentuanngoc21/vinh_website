import { describe, expect, it } from "vitest";
import { isScheduleRequest, vietnamScheduleTime } from "./publication-schedule";

const id = "00000000-0000-4000-8000-000000000001";
const valid = { id, chapterIds: [id], startsAt: "2026-10-02T13:00:00.000Z", intervalDays: 0 };
describe("publication schedule validation", () => {
  it("converts Vietnam time independently of the execution host timezone", () => {
    expect(vietnamScheduleTime("2026-10-02T20:00")).toBe("2026-10-02T13:00:00.000Z");
    expect(vietnamScheduleTime("2026-10-02T00:05")).toBe("2026-10-01T17:05:00.000Z");
  });
  it("rejects impossible dates and malformed input", () => {
    for (const value of ["2026-02-31T20:00", "2026-10-02T25:00", "", "02/10/2026 20:00"]) expect(vietnamScheduleTime(value)).toBeNull();
  });
  it("supports simultaneous and daily schedules including free chapters", () => {
    expect(isScheduleRequest(valid)).toBe(true);
    expect(isScheduleRequest({ ...valid, intervalDays: 1, price: 0 })).toBe(true);
  });
  it("rejects duplicates, empty or oversized selections, and invalid cadence", () => {
    for (const body of [{ ...valid, chapterIds: [id, id] }, { ...valid, chapterIds: [] },
      { ...valid, chapterIds: Array(301).fill(id) }, { ...valid, intervalDays: 2 }, { ...valid, id: "invalid" }]) {
      expect(isScheduleRequest(body)).toBe(false);
    }
  });
  it("rejects invalid prices and ambiguous timezones", () => {
    for (const price of [-1, 0.1, "100", 2147483648]) expect(isScheduleRequest({ ...valid, price })).toBe(false);
    expect(isScheduleRequest({ ...valid, startsAt: "2026-10-02T20:00" })).toBe(false);
  });
});
