/**
 * Dữ liệu công khai cho hub /cuoc-thi và microsite /cuoc-thi/[slug] — dùng
 * chung cho trang (Server Component) và API /api/contests/* (web + mobile).
 * Mọi thứ trả ra đã qua capability; không trả trường nội bộ (created_by,
 * cờ duyệt bài của người khác, điểm chưa công bố).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestReviewFlag, Database } from "@/lib/supabase/types";
import { areResultsVisible, getEntryVoteState, type ContestCapabilities, type ContestViewer } from "@/lib/contests/capabilities";
import { countdownFor, formatRemaining, PHASE_COPY } from "@/lib/contests/phase-copy";
import { readContestConfig, type EligibilityRules, type VoteRules } from "@/lib/contests/config";
import {
  capabilitiesFor,
  getContestBySlug,
  getContestViewer,
  getViewerSubmissions,
  type ContestRow,
} from "@/lib/contests/contest-service";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import { toHomepageBooks, type HomepageBook } from "@/lib/home/get-homepage-books";

type Client = SupabaseClient<Database>;
type BookRow = Database["public"]["Tables"]["books"]["Row"];

export type PublicContest = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  description: string;
  key_visual_url: string | null;
  banner_url: string | null;
  status: ContestRow["status"];
  submission_start: string;
  submission_end: string;
  voting_start: string | null;
  voting_end: string | null;
  judging_start: string | null;
  judging_end: string | null;
  result_at: string | null;
  results_published_at: string | null;
  archived_at: string | null;
  rules_content: string;
  rules_version: string;
  prizes_summary: { name: string; amount_vnd: number; extra: string }[];
  eligibility: EligibilityRules;
  vote: VoteRules;
};

export function toPublicContest(c: ContestRow): PublicContest {
  const config = readContestConfig(c);
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    short_description: c.short_description,
    description: c.description,
    key_visual_url: c.key_visual_url,
    banner_url: c.banner_url,
    status: c.status,
    submission_start: c.submission_start,
    submission_end: c.submission_end,
    voting_start: c.voting_start,
    voting_end: c.voting_end,
    judging_start: c.judging_start,
    judging_end: c.judging_end,
    result_at: c.result_at,
    results_published_at: c.results_published_at,
    archived_at: c.archived_at,
    rules_content: c.rules_content,
    rules_version: c.rules_version,
    prizes_summary: (c.prizes_summary ?? []) as PublicContest["prizes_summary"],
    eligibility: config.eligibility,
    vote: config.vote,
  };
}

/** Bài của người xem — chỉ cờ tác giả được thấy. */
export type ViewerEntry = {
  id: string;
  book_id: string;
  status: Database["public"]["Tables"]["contest_submissions"]["Row"]["status"];
  status_reason: string | null;
  submitted_at: string;
  revision_flags: Pick<ContestReviewFlag, "id" | "message" | "fix_by">[];
};

export type ContestPageData = {
  row: ContestRow;
  contest: PublicContest;
  viewer: ContestViewer;
  capabilities: ContestCapabilities;
  viewerEntries: ViewerEntry[];
  counts: { entries: number; authors: number };
  announcedAt: string | null;
  reminderOn: boolean;
  isAdminPreview: boolean;
};

/**
 * Nạp mọi thứ trang cuộc thi cần trong 1 lượt. Nháp chỉ mở cho admin
 * (isAdmin do caller kiểm bằng getAuthedAdminId) để xem trước.
 */
export async function loadContestPage(
  client: Client,
  input: { slug: string; viewerId: string | null; isAdmin?: boolean; now?: Date }
): Promise<ContestPageData> {
  const row = await getContestBySlug(client, input.slug, { includeDraft: input.isAdmin });
  const now = input.now ?? new Date();

  const [viewer, entries, summary, announced, reminder] = await Promise.all([
    getContestViewer(client, input.viewerId),
    getViewerSubmissions(client, row.id, input.viewerId),
    client.rpc("get_contest_summaries", { p_contest_ids: [row.id] }),
    client
      .from("contest_status_events")
      .select("created_at")
      .eq("contest_id", row.id)
      .eq("to_status", "announced")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    input.viewerId
      ? client.from("contest_reminders").select("user_id").eq("contest_id", row.id).eq("user_id", input.viewerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  throwIfError(summary.error, "get_contest_summaries");
  throwIfError(announced.error, "load announced event");
  throwIfError(reminder.error, "load reminder");

  // Capability mức cuộc thi: bài "đang dự thi" đầu tiên của người xem (nếu
  // có) quyết định can_withdraw / needs_revision; từng bài cụ thể được tính
  // lại ở trang tác giả (Slice 1.5).
  const primary = entries.find((e) => ["submitted", "eligible", "shortlisted"].includes(e.status)) ?? entries[0] ?? null;
  const capabilities = capabilitiesFor(
    row,
    viewer,
    primary ? { status: primary.status, review_flags: primary.review_flags as ContestReviewFlag[] } : null,
    now
  );
  const s = summary.data?.[0];

  return {
    row,
    contest: toPublicContest(row),
    viewer: { userId: viewer.userId, accountCreatedAt: viewer.accountCreatedAt },
    capabilities,
    viewerEntries: entries.map((e) => ({
      id: e.id,
      book_id: e.book_id,
      status: e.status,
      status_reason: e.status_reason,
      submitted_at: e.submitted_at,
      revision_flags: (e.review_flags as ContestReviewFlag[])
        .filter((f) => f.visible_to_author && f.resolved_at === null)
        .map((f) => ({ id: f.id, message: f.message, fix_by: f.fix_by })),
    })),
    counts: { entries: s?.entry_count ?? 0, authors: s?.author_count ?? 0 },
    announcedAt: announced.data?.created_at ?? null,
    reminderOn: Boolean(reminder.data),
    isAdminPreview: row.status === "draft",
  };
}

export type PublicAward = {
  id: string;
  award_code: string;
  award_name: string;
  award_rank: number | null;
  category: string | null;
  prize_vnd: number;
  prize_extras: string | null;
  revoked: boolean;
  revoked_reason: string | null;
  /** null = truyện không còn khả dụng (đã gỡ/xoá) — archive vẫn giữ tên, tác giả, giải. */
  book: HomepageBook | null;
  book_title: string;
  author_name: string;
};

/**
 * Giải của cuộc thi — CHỈ khi kết quả đã công bố (capability results_visible).
 * Đọc bằng service-role nên tự dựng placeholder cho truyện đã gỡ (XIX.4 / X).
 */
export async function listPublicAwards(client: Client, contest: ContestRow, now: Date = new Date()): Promise<PublicAward[]> {
  if (!areResultsVisible(contest, now)) return [];
  const { data: awards, error } = await client
    .from("contest_awards")
    .select("*")
    .eq("contest_id", contest.id)
    .order("award_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  throwIfError(error, "listPublicAwards");
  if (!awards?.length) return [];

  const { data: subs, error: subsError } = await client
    .from("contest_submissions")
    .select("id, book_id, author_id")
    .in("id", awards.map((a) => a.submission_id));
  throwIfError(subsError, "load award submissions");
  const bookIds = [...new Set((subs ?? []).map((s) => s.book_id))];
  const [{ data: books, error: booksError }, { data: authors, error: authorsError }] = await Promise.all([
    client.from("books").select("*").in("id", bookIds),
    client.from("author_public_profiles").select("id, nickname").in("id", [...new Set((subs ?? []).map((s) => s.author_id))]),
  ]);
  throwIfError(booksError, "load award books");
  throwIfError(authorsError, "load award authors");

  const visible = ((books ?? []) as BookRow[]).filter((b) => b.published && b.deleted_at === null);
  const cards = new Map((await toHomepageBooks(client, visible)).map((c) => [c.id, c]));
  const bookById = new Map(((books ?? []) as BookRow[]).map((b) => [b.id, b]));
  const nameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));
  const subById = new Map((subs ?? []).map((s) => [s.id, s]));

  return awards.map((a) => {
    const sub = subById.get(a.submission_id);
    const book = sub ? bookById.get(sub.book_id) : undefined;
    return {
      id: a.id,
      award_code: a.award_code,
      award_name: a.award_name,
      award_rank: a.award_rank,
      category: a.category,
      prize_vnd: a.prize_vnd,
      prize_extras: a.prize_extras,
      revoked: a.revoked_at !== null,
      revoked_reason: a.revoked_reason,
      book: sub ? (cards.get(sub.book_id) ?? null) : null,
      book_title: book?.title ?? "Tác phẩm không còn khả dụng",
      author_name: (sub && nameById.get(sub.author_id)) ?? "—",
    };
  });
}

/** Q4 "Nhắc tôi khi mở" — chỉ có ý nghĩa khi cuộc thi chưa mở nhận bài. */
export async function setReminder(client: Client, input: { contest: ContestRow; userId: string; on: boolean }): Promise<boolean> {
  if (input.on) {
    if (input.contest.status !== "announced") throw new ContestError("not_allowed");
    const { error } = await client
      .from("contest_reminders")
      .upsert({ contest_id: input.contest.id, user_id: input.userId }, { onConflict: "contest_id,user_id", ignoreDuplicates: true });
    throwIfError(error, "set reminder");
    return true;
  }
  const { error } = await client.from("contest_reminders").delete().eq("contest_id", input.contest.id).eq("user_id", input.userId);
  throwIfError(error, "unset reminder");
  return false;
}

/**
 * Giải cao nhất (chưa thu hồi) của mỗi cuộc thi đã công bố kết quả — dòng
 * "Giải Nhất: …" ở mục Dấu ấn các mùa thi trên hub. Một lượt truy vấn cho
 * mọi cuộc thi (không N+1).
 */
export async function listArchiveWinners(
  client: Client,
  contests: Pick<ContestRow, "id" | "status" | "results_published_at">[],
  now: Date = new Date()
): Promise<Map<string, { award_name: string; book_title: string }>> {
  const ids = contests.filter((c) => areResultsVisible(c as ContestRow, now)).map((c) => c.id);
  const out = new Map<string, { award_name: string; book_title: string }>();
  if (ids.length === 0) return out;
  const { data: awards, error } = await client
    .from("contest_awards")
    .select("contest_id, submission_id, award_name, award_rank")
    .in("contest_id", ids)
    .is("revoked_at", null)
    .order("award_rank", { ascending: true, nullsFirst: false });
  throwIfError(error, "listArchiveWinners");
  const top = new Map<string, { submission_id: string; award_name: string }>();
  for (const a of awards ?? []) if (!top.has(a.contest_id)) top.set(a.contest_id, a);
  if (top.size === 0) return out;

  const { data: subs, error: subsError } = await client
    .from("contest_submissions")
    .select("id, book_id")
    .in("id", [...top.values()].map((a) => a.submission_id));
  throwIfError(subsError, "load winner submissions");
  const { data: books, error: booksError } = await client
    .from("books")
    .select("id, title, published, deleted_at")
    .in("id", (subs ?? []).map((s) => s.book_id));
  throwIfError(booksError, "load winner books");
  const bookBySub = new Map((subs ?? []).map((s) => [s.id, (books ?? []).find((b) => b.id === s.book_id)]));

  for (const [contestId, a] of top) {
    const b = bookBySub.get(a.submission_id);
    out.set(contestId, {
      award_name: a.award_name,
      book_title: b && b.published && !b.deleted_at ? b.title : "Tác phẩm không còn khả dụng",
    });
  }
  return out;
}

export type StoryContestCard =
  | { kind: "award"; contest: { slug: string; title: string }; award_name: string }
  | {
      kind: "entry";
      contest: { slug: string; title: string; status: ContestRow["status"] };
      submission_id: string;
      phase_label: string;
      vote: ReturnType<typeof getEntryVoteState> | null;
    };

/**
 * Contest card trên trang truyện (/truyen/[slug]): giải đã công bố (lên đầu,
 * dẫn về trang kết quả chính thức — provenance) và các bài đang dự thi (kèm
 * nút bình chọn khi đang bình chọn). Không lưu gì trên books — suy ra từ
 * contest_submissions / contest_awards. Số truy vấn cố định.
 */
export async function getStoryContestCards(
  client: Client,
  input: { bookId: string; viewerId: string | null; now?: Date }
): Promise<StoryContestCard[]> {
  const now = input.now ?? new Date();
  const { data: subs, error } = await client
    .from("contest_submissions")
    .select("id, contest_id, author_id, status")
    .eq("book_id", input.bookId)
    .in("status", ["eligible", "shortlisted"]);
  throwIfError(error, "story contest submissions");
  if (!subs?.length) return [];

  const [contests, awards, votes, reads, viewer] = await Promise.all([
    client.from("contests").select("*").in("id", subs.map((s) => s.contest_id)).neq("status", "draft"),
    client.from("contest_awards").select("contest_id, award_name, award_rank, revoked_at").in("submission_id", subs.map((s) => s.id)).is("revoked_at", null),
    input.viewerId
      ? client.from("contest_votes").select("submission_id").eq("user_id", input.viewerId).in("submission_id", subs.map((s) => s.id))
      : Promise.resolve({ data: [] as { submission_id: string }[], error: null }),
    input.viewerId
      ? client.from("reading_history").select("chapter_id").eq("user_id", input.viewerId).eq("book_id", input.bookId).not("chapter_id", "is", null).limit(500)
      : Promise.resolve({ data: [] as { chapter_id: string | null }[], error: null }),
    getContestViewer(client, input.viewerId),
  ]);
  throwIfError(contests.error, "story contests");
  throwIfError(awards.error, "story awards");
  throwIfError(votes.error, "story votes");
  throwIfError(reads.error, "story reads");

  // "Đã đọc hết ≥ 1 chương đang hiển thị" — cùng điều kiện với cast_contest_vote().
  const readIds = [...new Set((reads.data ?? []).map((r) => r.chapter_id).filter((x): x is string => x !== null))];
  let completed = false;
  if (readIds.length) {
    const { data: visible, error: vError } = await client
      .from("chapters")
      .select("id")
      .in("id", readIds)
      .eq("book_id", input.bookId)
      .eq("published", true)
      .is("removed_at", null)
      .limit(1);
    throwIfError(vError, "story visible chapters");
    completed = (visible ?? []).length > 0;
  }

  const voted = new Set((votes.data ?? []).map((v) => v.submission_id));
  const contestById = new Map((contests.data ?? []).map((c) => [c.id, c]));
  const cards: StoryContestCard[] = [];

  for (const a of (awards.data ?? []).sort((x, y) => (x.award_rank ?? 99) - (y.award_rank ?? 99))) {
    const c = contestById.get(a.contest_id);
    if (c && areResultsVisible(c, now)) cards.push({ kind: "award", contest: { slug: c.slug, title: c.title }, award_name: a.award_name });
  }
  for (const s of subs) {
    const c = contestById.get(s.contest_id);
    if (!c || areResultsVisible(c, now)) continue;
    const caps = capabilitiesFor(c, viewer, null, now);
    const cd = countdownFor(c);
    cards.push({
      kind: "entry",
      contest: { slug: c.slug, title: c.title, status: c.status },
      submission_id: s.id,
      phase_label: PHASE_COPY[c.status].label + (cd && cd.mode === "countdown" ? ` · ${cd.label} ${formatRemaining(Date.parse(cd.target) - now.getTime())}` : ""),
      vote:
        c.status === "community_voting"
          ? getEntryVoteState({
              capabilities: caps,
              viewerId: input.viewerId,
              entry: { author_id: s.author_id, status: s.status, book_visible: true },
              hasVoted: voted.has(s.id),
              hasCompletedChapter: completed,
              requireCompletedChapter: readContestConfig(c).vote.require_completed_chapter,
            })
          : null,
    });
  }
  return cards;
}
