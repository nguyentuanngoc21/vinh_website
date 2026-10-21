import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

type ScheduledContest = Pick<Database["public"]["Tables"]["contests"]["Row"], "id" | "status" | "submission_start" | "submission_end">;

/** Database locks/rechecks the row so concurrent visits open it only once. */
export async function ensureScheduledOpening<T extends ScheduledContest>(client: SupabaseClient<Database>, contest: T, now = new Date()): Promise<T> {
  const time = now.getTime();
  if (contest.status !== "announced" || time < Date.parse(contest.submission_start) || time >= Date.parse(contest.submission_end)) return contest;
  const { data, error } = await client.rpc("open_due_contest", { p_contest_id: contest.id });
  throwIfError(error, "open due contest");
  if (data?.[0]) {
    const { notifyOpenReminders } = await import("./lifecycle-service");
    await notifyOpenReminders(client, data[0]);
    return { ...contest, ...data[0] };
  }
  // Another request/admin may have transitioned the contest while we waited.
  const fresh = await client.from("contests").select("*").eq("id", contest.id).single();
  throwIfError(fresh.error, "reload scheduled contest");
  return { ...contest, ...fresh.data };
}
