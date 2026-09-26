import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getContestCapabilities,
  type ContestCapabilities,
  type ContestViewer,
  type ViewerSubmission,
} from "@/lib/contests/capabilities";
import { readContestConfig } from "@/lib/contests/config";
import { ContestError, throwIfError } from "@/lib/contests/errors";

type Client = SupabaseClient<Database>;
export type ContestRow = Database["public"]["Tables"]["contests"]["Row"];

/** Trạng thái hub gom vào "đang diễn ra" (có thể tham gia / đọc / bình chọn). */
export const RUNNING_STATUSES = ["announced", "submission_open", "submission_closed", "community_voting", "judging"] as const;
export const FINISHED_STATUSES = ["results", "archived"] as const;

/**
 * Cuộc thi công khai theo slug. Client là service-role (bỏ qua RLS), nên
 * tự chặn nháp ở đây; admin xem nháp qua `includeDraft`.
 */
export async function getContestBySlug(client: Client, slug: string, opts: { includeDraft?: boolean } = {}): Promise<ContestRow> {
  const { data, error } = await client.from("contests").select("*").eq("slug", slug).maybeSingle();
  throwIfError(error, "getContestBySlug");
  if (!data || (data.status === "draft" && !opts.includeDraft)) throw new ContestError("contest_not_found");
  return data;
}

/** Người xem cho capability: tuổi tài khoản lấy từ auth.users (service-role). */
export async function getContestViewer(client: Client, userId: string | null): Promise<ContestViewer & { emailVerified: boolean }> {
  if (!userId) return { userId: null, accountCreatedAt: null, emailVerified: false };
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error || !data.user) return { userId, accountCreatedAt: null, emailVerified: false };
  return {
    userId,
    accountCreatedAt: data.user.created_at ?? null,
    emailVerified: Boolean(data.user.email_confirmed_at),
  };
}

export function capabilitiesFor(
  contest: ContestRow,
  viewer: ContestViewer,
  viewerSubmission: ViewerSubmission | null,
  now: Date = new Date()
): ContestCapabilities {
  const config = readContestConfig(contest);
  return getContestCapabilities({
    contest,
    eligibility: config.eligibility,
    vote: config.vote,
    viewer,
    viewerSubmission,
    now,
  });
}

/** Bài của người xem trong cuộc thi (bài của 1 tác giả có thể nhiều sách). */
export async function getViewerSubmissions(client: Client, contestId: string, userId: string | null) {
  if (!userId) return [];
  const { data, error } = await client
    .from("contest_submissions")
    .select("id, book_id, status, status_reason, review_flags, submitted_at")
    .eq("contest_id", contestId)
    .eq("author_id", userId)
    .order("submitted_at", { ascending: false });
  throwIfError(error, "getViewerSubmissions");
  return data ?? [];
}

export type ContestSummary = Pick<
  ContestRow,
  | "id" | "slug" | "title" | "short_description" | "key_visual_url" | "banner_url" | "status" | "is_featured"
  | "submission_start" | "submission_end" | "voting_start" | "voting_end" | "result_at" | "results_published_at" | "archived_at"
> & { entry_count: number; author_count: number };

const SUMMARY_COLUMNS =
  "id, slug, title, short_description, key_visual_url, banner_url, status, is_featured, submission_start, submission_end, voting_start, voting_end, result_at, results_published_at, archived_at";

/**
 * Dữ liệu hub /cuoc-thi: cuộc thi nổi bật, đang diễn ra, đã kết thúc (lưu
 * trữ theo năm do UI nhóm). Đếm bài/tác giả trong 1 lần gọi SQL cho mọi thẻ.
 */
export async function listContestsForHub(client: Client, opts: { finishedLimit?: number } = {}) {
  const [running, finished] = await Promise.all([
    client.from("contests").select(SUMMARY_COLUMNS).in("status", [...RUNNING_STATUSES]).order("submission_end", { ascending: true }),
    client
      .from("contests")
      .select(SUMMARY_COLUMNS)
      .in("status", [...FINISHED_STATUSES])
      .order("results_published_at", { ascending: false, nullsFirst: false })
      .limit(opts.finishedLimit ?? 30),
  ]);
  throwIfError(running.error, "listContestsForHub running");
  throwIfError(finished.error, "listContestsForHub finished");

  const all = [...(running.data ?? []), ...(finished.data ?? [])];
  const counts = new Map<string, { entry_count: number; author_count: number }>();
  if (all.length) {
    const { data, error } = await client.rpc("get_contest_summaries", { p_contest_ids: all.map((c) => c.id) });
    throwIfError(error, "get_contest_summaries");
    for (const r of data ?? []) counts.set(r.contest_id, { entry_count: r.entry_count, author_count: r.author_count });
  }
  const withCounts = (rows: typeof all): ContestSummary[] =>
    rows.map((c) => ({ ...c, ...(counts.get(c.id) ?? { entry_count: 0, author_count: 0 }) }));

  const runningRows = withCounts(running.data ?? []);
  const featured = runningRows.filter((c) => c.is_featured);
  return {
    // Hero: cuộc thi được đánh dấu nổi bật; nếu chưa đánh dấu cái nào thì
    // lấy cuộc thi sắp đến hạn nhất để hero không trống.
    featured: featured.length ? featured : runningRows.slice(0, 1),
    running: runningRows,
    finished: withCounts(finished.data ?? []),
  };
}
