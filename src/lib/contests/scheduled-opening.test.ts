import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ensureScheduledOpening } from "./scheduled-opening";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("./lifecycle-service", () => ({ notifyOpenReminders: notify }));
const now = new Date("2026-10-21T14:12:00Z");
const contest = { id: "c", status: "announced" as const, submission_start: "2026-10-21T14:00:00Z", submission_end: "2026-11-01T00:00:00Z" };
const rpc = vi.fn();
const single = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }));
const client = { rpc, from } as unknown as SupabaseClient<Database>;
beforeEach(() => { vi.clearAllMocks(); notify.mockResolvedValue(0); });

it("opens an overdue announced contest and returns its persisted status", async () => {
  rpc.mockResolvedValue({ data: [{ ...contest, status: "submission_open", slug: "tet", title: "Tet" }], error: null });
  expect((await ensureScheduledOpening(client, contest, now)).status).toBe("submission_open");
  expect(rpc).toHaveBeenCalledWith("open_due_contest", { p_contest_id: "c" });
  expect(notify).toHaveBeenCalledTimes(1);
});
it("attempts opening exactly at the scheduled time", async () => {
  rpc.mockResolvedValue({ data: [{ ...contest, status: "submission_open" }], error: null });
  await ensureScheduledOpening(client, contest, new Date(contest.submission_start));
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("does not open before the scheduled time, after the deadline or in other states", async () => {
  await ensureScheduledOpening(client, contest, new Date("2026-10-21T13:59:59Z"));
  await ensureScheduledOpening(client, contest, new Date(contest.submission_end));
  for (const status of ["draft", "submission_open", "submission_closed", "community_voting", "results", "archived"] as const) {
    await ensureScheduledOpening(client, { ...contest, status }, now);
  }
  expect(rpc).not.toHaveBeenCalled();
});
it("reloads a concurrent transition without sending duplicate reminders", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  single.mockResolvedValue({ data: { ...contest, status: "submission_open" }, error: null });
  expect((await ensureScheduledOpening(client, contest, now)).status).toBe("submission_open");
  expect(notify).not.toHaveBeenCalled();
});
it("surfaces database errors instead of claiming the contest is open", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
  await expect(ensureScheduledOpening(client, contest, now)).rejects.toThrow("Unavailable");
});
