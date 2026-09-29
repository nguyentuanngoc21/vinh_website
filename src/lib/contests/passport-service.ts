/**
 * Contest Passport (Phase 3, Slice 3.2). Cột mốc + mục tiêu nằm DUY NHẤT ở
 * contest_passport_state() (migrations/archive/20260927_add_contest_passport.sql);
 * file này chỉ giữ nhãn hiển thị và nạp dữ liệu cho microsite / hub.
 * Tiến độ ghi ở record_contest_activity() (activity-service.ts) — không có
 * đường ghi thứ hai.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestStatus, Database } from "@/lib/supabase/types";
import { throwIfError } from "@/lib/contests/errors";

type Client = SupabaseClient<Database>;

/** Mùa thi: Passport ghi nhận + hiển thị tiến độ. Sau đó chỉ còn huy hiệu (nếu đã đạt). */
export const PASSPORT_SEASON_STATUSES: ContestStatus[] = ["submission_open", "submission_closed", "community_voting", "judging"];

export const PASSPORT_MILESTONES: Record<string, { title: string; hint: string }> = {
  read_entry: { title: "Đọc 1 bài dự thi", hint: "Đọc hết 1 chương, đọc thật — không lướt." },
  read_3_authors: { title: "Đọc bài của 3 tác giả", hint: "Mỗi tác giả khác nhau tính 1." },
  finish_entry: { title: "Đọc hết 1 tác phẩm", hint: "Đọc thật mọi chương của một bài dự thi." },
  hidden_gem: { title: "Tìm 1 viên ngọc ẩn", hint: "Đọc một bài còn ít người đọc (hàng Viên ngọc ẩn)." },
  comment_entry: { title: "Bình luận 1 bài", hint: "Để lại cảm nhận ở một tác phẩm dự thi." },
  vote_3: { title: "Bình chọn 3 bài", hint: "Trong khung bình chọn, cho bài bạn đã đọc." },
  return_3_days: { title: "Quay lại 3 ngày", hint: "Đọc thật ở 3 ngày khác nhau." },
};

export const PASSPORT_BADGE_NAME = "Người đi hết mùa thi";

export type PassportMilestone = { code: string; title: string; hint: string; progress: number; target: number; done: boolean };
export type Passport = { milestones: PassportMilestone[]; doneCount: number; completedAt: string | null };

export function parsePassport(raw: unknown): Passport {
  const r = (raw && typeof raw === "object" ? raw : {}) as { milestones?: unknown; completed_at?: unknown };
  const list = Array.isArray(r.milestones) ? (r.milestones as Record<string, unknown>[]) : [];
  const milestones = list.map((m) => {
    const code = String(m.code ?? "");
    const progress = Number(m.progress) || 0;
    const target = Number(m.target) || 1;
    const label = PASSPORT_MILESTONES[code] ?? { title: code, hint: "" };
    return { code, title: label.title, hint: label.hint, progress, target, done: progress >= target };
  });
  return {
    milestones,
    doneCount: milestones.filter((m) => m.done).length,
    completedAt: typeof r.completed_at === "string" ? r.completed_at : null,
  };
}

/** Trạng thái Passport; ghi huy hiệu nếu vừa đủ mốc (idempotent, chỉ trong mùa thi — SQL kiểm). */
export async function getPassport(client: Client, input: { userId: string; contestId: string }): Promise<Passport> {
  const { data, error } = await client.rpc("contest_passport_state", {
    p_user_id: input.userId,
    p_contest_id: input.contestId,
    p_record_completion: true,
  });
  throwIfError(error, "contest_passport_state");
  return parsePassport(data);
}

export type TodayEventQuest = { title: string; description: string | null; progress: number; target: number; completed: boolean; claimed: boolean };

/** Nhiệm vụ sự kiện hôm nay CỦA cuộc thi này (Slice 3.1) — null nếu ô sự kiện hôm nay thuộc cuộc thi khác / chưa có. */
export async function getTodayEventQuest(client: Client, input: { userId: string; contestId: string }): Promise<TodayEventQuest | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: slot, error } = await client
    .from("user_quest_pool").select("task_template_id, pool_date")
    .eq("user_id", input.userId).eq("pool_date", today).eq("slot_kind", "event").eq("contest_id", input.contestId).maybeSingle();
  throwIfError(error, "load event slot");
  if (!slot) return null;
  const [{ data: template }, { data: task }] = await Promise.all([
    client.from("task_templates").select("title, description, target_count").eq("id", slot.task_template_id).maybeSingle(),
    client.from("user_daily_tasks").select("progress, completed, claimed")
      .eq("user_id", input.userId).eq("template_id", slot.task_template_id).eq("task_date", slot.pool_date).maybeSingle(),
  ]);
  if (!template) return null;
  return {
    title: template.title,
    description: template.description,
    progress: task?.progress ?? 0,
    target: template.target_count,
    completed: task?.completed ?? false,
    claimed: task?.claimed ?? false,
  };
}
