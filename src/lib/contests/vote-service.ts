/**
 * Bình chọn (D5). Luật nằm trọn trong cast_contest_vote()/retract_contest_vote()
 * — service chỉ kiểm bài thuộc đúng cuộc thi trên URL rồi đổi mã lỗi.
 * Nút bình chọn trên UI lấy lý do từ getEntryVoteState() (capabilities.ts),
 * cùng thứ tự kiểm với RPC.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ContestRow } from "@/lib/contests/contest-service";
import { throwIfError } from "@/lib/contests/errors";
import { assertSubmissionInContest } from "@/lib/contests/submission-service";
import { recordContestActivity } from "@/lib/contests/activity-service";

type Client = SupabaseClient<Database>;

export async function castVote(client: Client, input: { contest: ContestRow; viewerId: string; submissionId: string }) {
  await assertSubmissionInContest(client, input.contest.id, input.submissionId);
  const { data, error } = await client.rpc("cast_contest_vote", {
    p_user_id: input.viewerId,
    p_submission_id: input.submissionId,
  });
  throwIfError(error, "cast_contest_vote");
  // Nhiệm vụ sự kiện "bình chọn cho bài đã đọc" (Slice 3.1).
  const { data: sub } = await client.from("contest_submissions").select("book_id").eq("id", input.submissionId).maybeSingle();
  if (sub) await recordContestActivity({ userId: input.viewerId, event: "vote", bookId: sub.book_id });
  return data as Database["public"]["Tables"]["contest_votes"]["Row"];
}

/** true nếu có phiếu để bỏ. */
export async function retractVote(client: Client, input: { contest: ContestRow; viewerId: string; submissionId: string }) {
  await assertSubmissionInContest(client, input.contest.id, input.submissionId);
  const { data, error } = await client.rpc("retract_contest_vote", {
    p_user_id: input.viewerId,
    p_submission_id: input.submissionId,
  });
  throwIfError(error, "retract_contest_vote");
  return Boolean(data);
}
