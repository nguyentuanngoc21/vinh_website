import type { SupabaseClient } from "@supabase/supabase-js";
import type { AchievementMetric, Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type AchievementTemplateRow = Database["public"]["Tables"]["achievement_templates"]["Row"];

export type AchievementView = {
  id: string;
  code: string;
  forRole: AchievementTemplateRow["for_role"];
  title: string;
  description: string | null;
  icon: string | null;
  colorToken: string;
  rewardTokens: number;
  unlocked: boolean;
  unlockedAt: string | null;
  // Chỉ có ở thành tựu metric-based CHƯA mở khoá — cho FE vẽ progress bar
  // (vd "3/5 truyện"). null cho thành tựu đã unlock (không cần nữa) và
  // cho loại streak-linked (metric NULL — tiến trình thật là
  // profiles.current_quest_streak, hình dạng khác, chưa hiện ở đây).
  progress: { current: number; target: number } | null;
};

/**
 * Đọc + đồng bộ thành tựu của 1 user — 1 khung chung cho mọi loại thành
 * tựu (metric-based: author/narrator/designer, VÀ streak-linked qua
 * streak_milestones.badge_id), lọc/tô màu theo forRole ở tầng UI (NULL =
 * chung/đọc giả). Xem migrations/20260908_add_achievements.sql.
 */
export const AchievementService = {
  async listForUser(supabase: Client, userId: string): Promise<AchievementView[]> {
    // Lazy-pull: cấp (+ thưởng nếu có) mọi achievement_templates metric-based
    // mà user vừa đủ điều kiện, TRƯỚC khi đọc lại — cùng cách
    // increment_task_progress() tự tạo dòng nhiệm vụ hôm nay, không cần
    // chờ cron. Không throw nếu lỗi — hiển thị thành tựu cũ vẫn tốt hơn
    // là hỏng cả trang vì 1 lần đồng bộ thất bại.
    await supabase.rpc("sync_user_achievements", { p_user_id: userId });

    const [templatesRes, userAchievementsRes, streakMilestonesRes, streakClaimsRes, metricCounts] = await Promise.all([
      supabase.from("achievement_templates").select("*").eq("active", true),
      supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId),
      // Chỉ những mốc đã gắn badge_id (đa số hàng cũ hiện vẫn NULL cho tới
      // khi admin gán) — không phải mọi streak_milestones đều tham gia
      // khung thành tựu.
      supabase.from("streak_milestones").select("id, badge_id").not("badge_id", "is", null),
      supabase.from("user_streak_milestone_claims").select("streak_milestone_id, claimed_at").eq("user_id", userId),
      getMetricCounts(supabase, userId),
    ]);

    const templates = templatesRes.data ?? [];
    const unlockedByAchievementId = new Map(
      (userAchievementsRes.data ?? []).map((r) => [r.achievement_id, r.unlocked_at])
    );
    // badge_id (achievement_templates.id) -> streak_milestones.id — để tra
    // ngược từ 1 hàng achievement_templates streak-linked sang đúng mốc.
    const streakMilestoneIdByBadgeId = new Map(
      (streakMilestonesRes.data ?? [])
        .filter((m): m is { id: string; badge_id: string } => m.badge_id !== null)
        .map((m) => [m.badge_id, m.id])
    );
    const claimedAtByStreakMilestoneId = new Map(
      (streakClaimsRes.data ?? []).map((c) => [c.streak_milestone_id, c.claimed_at])
    );

    return templates.map((t) => {
      // metric-based (author/narrator/designer): unlock ghi trực tiếp ở
      // user_achievements bởi sync_user_achievements() phía trên.
      if (t.metric !== null) {
        const unlockedAt = unlockedByAchievementId.get(t.id) ?? null;
        const unlocked = unlockedAt !== null;
        const progress = unlocked ? null : { current: metricCounts[t.metric], target: t.threshold ?? 0 };
        return toView(t, unlocked, unlockedAt, progress);
      }

      // streak-linked (metric NULL): unlock thật nằm ở
      // user_streak_milestone_claims, tra qua streak_milestones.badge_id.
      // Chưa gắn badge_id nào (admin chưa cấu hình) → coi như thành tựu
      // tĩnh, chưa unlock được, không phải lỗi. Chưa hiện progress cho
      // loại này (tiến trình thật là profiles.current_quest_streak so với
      // streak_milestones.streak_days — hình dạng khác, để sau).
      const streakMilestoneId = streakMilestoneIdByBadgeId.get(t.id);
      const unlockedAt = streakMilestoneId ? (claimedAtByStreakMilestoneId.get(streakMilestoneId) ?? null) : null;
      return toView(t, unlockedAt !== null, unlockedAt, null);
    });
  },
};

const SESSION_GAP_MS = 30 * 60 * 1000;
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

/** Chuỗi order_index LIÊN TIẾP dài nhất trong 1 sách, tính trên MỌI sách
 * user đã đọc — vd đọc chương 3,4,5 (liên tiếp) rồi nhảy sang chương 9 =
 * chuỗi dài nhất 3, không phải 4. */
function longestConsecutiveRun(chapters: { book_id: string; order_index: number }[]): number {
  const indicesByBook = new Map<string, Set<number>>();
  for (const c of chapters) {
    if (!indicesByBook.has(c.book_id)) indicesByBook.set(c.book_id, new Set());
    indicesByBook.get(c.book_id)!.add(c.order_index);
  }
  let longest = 0;
  for (const indices of indicesByBook.values()) {
    const sorted = [...indices].sort((a, b) => a - b);
    let run = 0;
    for (let i = 0; i < sorted.length; i++) {
      run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

/** Số "phiên đọc" nhiều nhất trong 1 NGÀY bất kỳ — phiên = chuỗi lượt đọc
 * cách nhau tối đa 30 phút, quá 30 phút tính là phiên mới (không có dữ
 * liệu start/end phiên thật — xem reading_sessions, bảng đó vẫn chưa được
 * ghi, đây là ước lượng từ reading_history.read_at). */
function maxSessionsInADay(readAtIso: string[]): number {
  const byDay = new Map<string, number[]>();
  for (const iso of readAtIso) {
    const day = iso.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(new Date(iso).getTime());
  }
  let max = 0;
  for (const times of byDay.values()) {
    const sorted = times.slice().sort((a, b) => a - b);
    let sessions = 0;
    let prev: number | null = null;
    for (const t of sorted) {
      if (prev === null || t - prev > SESSION_GAP_MS) sessions++;
      prev = t;
    }
    max = Math.max(max, sessions);
  }
  return max;
}

/** Khoảng cách (ngày) dài nhất giữa 2 lượt đọc LIÊN TIẾP của CÙNG 1 sách —
 * "quay lại sau N ngày không đọc" dùng chung công thức này với 2 ngưỡng
 * khác nhau (7/15) ở 2 thành tựu reader_continue_after_pause/reader_comeback_15d. */
function maxGapDaysSameBook(rows: { book_id: string; read_at: string }[]): number {
  const byBook = new Map<string, number[]>();
  for (const r of rows) {
    if (!byBook.has(r.book_id)) byBook.set(r.book_id, []);
    byBook.get(r.book_id)!.push(new Date(r.read_at).getTime());
  }
  let maxGapDays = 0;
  for (const times of byBook.values()) {
    const sorted = times.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      maxGapDays = Math.max(maxGapDays, (sorted[i] - sorted[i - 1]) / (24 * 60 * 60 * 1000));
    }
  }
  return Math.floor(maxGapDays);
}

/** Số thể loại KHÁC NHAU nhiều nhất mà lần-đầu-đọc rơi trong cùng 1 cửa
 * sổ 15 ngày — dùng mốc "lần đầu đọc mỗi thể loại" làm điểm neo, không
 * phải mọi lượt đọc (đọc lại 1 thể loại cũ không mở cửa sổ mới). */
function maxGenresWithinWindow(firstReadByGenre: Map<string, number>): number {
  const firstReads = [...firstReadByGenre.values()];
  let max = 0;
  for (const t0 of firstReads) {
    const count = firstReads.filter((t) => t >= t0 && t <= t0 + FIFTEEN_DAYS_MS).length;
    max = Math.max(max, count);
  }
  return max;
}

/** COUNT thật cho từng metric — dùng để hiện progress bar của thành tựu
 * CHƯA unlock. Cùng bảng/cột với getUnlockedRoles() (creator-roles.ts)
 * nhưng cần số đếm thật (so ngưỡng), không chỉ có/không, nên tách riêng
 * thay vì tái dùng thẳng hàm đó.
 *
 * MỌI metric tính từ reading_history ở đây PHẢI khớp đúng công thức
 * trong sync_user_achievements() (docs/supabase/schema.sql, phần 10) — 2
 * nơi tính cùng 1 công thức (SQL cho unlock thật, JS ở đây cho progress
 * bar hiển thị), đổi 1 bên nhớ đổi bên kia. Giờ-trong-ngày/ranh giới ngày
 * dùng server/UTC thống nhất, không theo timezone từng user (xem
 * migrations/20260917_add_reading_event_log.sql). */
async function getMetricCounts(supabase: Client, userId: string): Promise<Record<AchievementMetric, number>> {
  const [booksRes, audioRes, designRes, readingHistoryRes, topupRes, readingListsRes, highlightsRes, followsRes] =
    await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("published", true),
      supabase.from("audio_narrations").select("id", { count: "exact", head: true }).eq("narrator_id", userId),
      supabase.from("design_items").select("id", { count: "exact", head: true }).eq("illustrator_id", userId),
      supabase.from("reading_history").select("book_id, chapter_id, read_at").eq("user_id", userId),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "topup")
        .neq("status", "reversed"),
      supabase.from("reading_lists").select("id").eq("user_id", userId),
      supabase.from("highlights").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("character_follows").select("character_id").eq("follower_id", userId),
    ]);

  const rows = readingHistoryRes.data ?? [];
  const distinctChapterIds = [...new Set(rows.map((r) => r.chapter_id).filter((id): id is string => id !== null))];
  const distinctBookIds = [...new Set(rows.map((r) => r.book_id))];

  const listIds = (readingListsRes.data ?? []).map((l) => l.id);
  const readingListItemsRes = listIds.length
    ? await supabase.from("reading_list_items").select("book_id").in("list_id", listIds)
    : { data: [] as { book_id: string }[] };
  const bookmarkedBookIds = [...new Set((readingListItemsRes.data ?? []).map((i) => i.book_id))];

  // 1 query cho genre/tags/view_count của MỌI sách cần tới (đã đọc + đã
  // bookmark) — tránh 2 round-trip riêng cho 2 nhóm.
  const allBookIds = [...new Set([...distinctBookIds, ...bookmarkedBookIds])];

  const [chaptersRes, booksInfoRes] = await Promise.all([
    distinctChapterIds.length > 0
      ? supabase.from("chapters").select("id, book_id, order_index, is_last_chapter").in("id", distinctChapterIds)
      : Promise.resolve({ data: [] as { id: string; book_id: string; order_index: number; is_last_chapter: boolean }[] }),
    allBookIds.length > 0
      ? supabase.from("books").select("id, genre, tags, view_count").in("id", allBookIds)
      : Promise.resolve({ data: [] as { id: string; genre: string | null; tags: string[]; view_count: number }[] }),
  ]);

  const chapters = chaptersRes.data ?? [];
  const booksInfo = booksInfoRes.data ?? [];
  const genreByBookId = new Map(booksInfo.map((b) => [b.id, b.genre]));
  const tagsByBookId = new Map(booksInfo.map((b) => [b.id, b.tags]));
  const viewCountByBookId = new Map(booksInfo.map((b) => [b.id, b.view_count]));

  const nightReads = rows.filter((r) => {
    const hour = new Date(r.read_at).getUTCHours();
    return hour >= 22 || hour < 2;
  }).length;
  // CHỈ tính genre của sách ĐÃ ĐỌC — genreByBookId giờ có cả sách bookmark
  // (không phải đọc), không được lẫn vào đây.
  const distinctGenres = new Set(
    distinctBookIds.map((id) => genreByBookId.get(id)).filter((g): g is string => !!g)
  );

  const finishedStories = new Set(chapters.filter((c) => c.is_last_chapter).map((c) => c.book_id));
  const sadEndingFinished = [...finishedStories].filter((bookId) =>
    (tagsByBookId.get(bookId) ?? []).some((tag) => tag.toLowerCase().trim() === "kết buồn")
  );
  const underratedFinished = [...finishedStories].filter((bookId) => (viewCountByBookId.get(bookId) ?? 0) < 50);

  const booksByGenre = new Map<string, Set<string>>();
  const firstReadByGenre = new Map<string, number>();
  for (const r of rows) {
    const genre = genreByBookId.get(r.book_id);
    if (!genre) continue;
    if (!booksByGenre.has(genre)) booksByGenre.set(genre, new Set());
    booksByGenre.get(genre)!.add(r.book_id);
    const t = new Date(r.read_at).getTime();
    const cur = firstReadByGenre.get(genre);
    if (cur === undefined || t < cur) firstReadByGenre.set(genre, t);
  }

  const bookmarkedByGenre = new Map<string, Set<string>>();
  for (const bookId of bookmarkedBookIds) {
    const genre = genreByBookId.get(bookId);
    if (!genre) continue;
    if (!bookmarkedByGenre.has(genre)) bookmarkedByGenre.set(genre, new Set());
    bookmarkedByGenre.get(genre)!.add(bookId);
  }

  const hasSaturday = rows.some((r) => new Date(r.read_at).getUTCDay() === 6);
  const hasSunday = rows.some((r) => new Date(r.read_at).getUTCDay() === 0);

  // Nhân vật — followedCharacterIds dùng chung cho cả 3 metric bên dưới.
  const followedCharacterIds = [...new Set((followsRes.data ?? []).map((f) => f.character_id))];
  const [charactersInfoRes, chapterCharsRes] = await Promise.all([
    followedCharacterIds.length > 0
      ? supabase.from("characters").select("id, role").in("id", followedCharacterIds)
      : Promise.resolve({ data: [] as { id: string; role: string }[] }),
    followedCharacterIds.length > 0
      ? supabase.from("chapter_characters").select("character_id, chapter_id").in("character_id", followedCharacterIds)
      : Promise.resolve({ data: [] as { character_id: string; chapter_id: string }[] }),
  ]);
  const roleByCharacterId = new Map((charactersInfoRes.data ?? []).map((c) => [c.id, c.role]));
  const villainFollowedCount = followedCharacterIds.filter((id) => roleByCharacterId.get(id) === "villain").length;
  const heroFollowedCount = followedCharacterIds.filter((id) => roleByCharacterId.get(id) === "hero").length;

  const taggedChapterIds = [...new Set((chapterCharsRes.data ?? []).map((cc) => cc.chapter_id))];
  const taggedChaptersInfoRes = taggedChapterIds.length
    ? await supabase.from("chapters").select("id, published").in("id", taggedChapterIds)
    : { data: [] as { id: string; published: boolean }[] };
  const publishedByChapterId = new Map((taggedChaptersInfoRes.data ?? []).map((c) => [c.id, c.published]));
  const readChapterIdSet = new Set(distinctChapterIds);

  const publishedChaptersByCharacter = new Map<string, string[]>();
  for (const cc of chapterCharsRes.data ?? []) {
    if (!publishedByChapterId.get(cc.chapter_id)) continue;
    if (!publishedChaptersByCharacter.has(cc.character_id)) publishedChaptersByCharacter.set(cc.character_id, []);
    publishedChaptersByCharacter.get(cc.character_id)!.push(cc.chapter_id);
  }
  // Follow >=1 nhân vật MÀ đã đọc hết mọi chương đã xuất bản có gắn nhân
  // vật đó — loại nhân vật chưa xuất hiện ở chương xuất bản nào (chapterIds
  // rỗng không nên tự động "hoàn thành").
  const characterGuardianAchieved = followedCharacterIds.some((charId) => {
    const chapterIds = publishedChaptersByCharacter.get(charId) ?? [];
    return chapterIds.length > 0 && chapterIds.every((cid) => readChapterIdSet.has(cid));
  })
    ? 1
    : 0;

  return {
    books_published: booksRes.count ?? 0,
    audio_published: audioRes.count ?? 0,
    design_published: designRes.count ?? 0,
    chapters_read: distinctChapterIds.length,
    genres_read_count: distinctGenres.size,
    night_reads_count: nightReads,
    finished_stories_count: finishedStories.size,
    longest_consecutive_chapters: longestConsecutiveRun(chapters),
    distinct_reading_days_count: new Set(rows.map((r) => r.read_at.slice(0, 10))).size,
    max_reading_sessions_per_day: maxSessionsInADay(rows.map((r) => r.read_at)),
    max_gap_days_same_book: maxGapDaysSameBook(rows),
    weekend_both_days_read: hasSaturday && hasSunday ? 1 : 0,
    max_books_read_same_genre: Math.max(0, ...[...booksByGenre.values()].map((s) => s.size)),
    max_genres_within_15_days: maxGenresWithinWindow(firstReadByGenre),
    topup_count: topupRes.count ?? 0,
    sad_ending_finished_count: sadEndingFinished.length,
    underrated_finished_count: underratedFinished.length,
    bookmarked_books_count: bookmarkedBookIds.length,
    max_bookmarked_books_same_genre: Math.max(0, ...[...bookmarkedByGenre.values()].map((s) => s.size)),
    saved_highlights_count: highlightsRes.count ?? 0,
    villain_followed_count: villainFollowedCount,
    hero_followed_count: heroFollowedCount,
    character_guardian_achieved: characterGuardianAchieved,
  };
}

function toView(
  t: AchievementTemplateRow,
  unlocked: boolean,
  unlockedAt: string | null,
  progress: AchievementView["progress"]
): AchievementView {
  return {
    id: t.id,
    code: t.code,
    forRole: t.for_role,
    title: t.title,
    description: t.description,
    icon: t.icon,
    colorToken: t.color_token,
    rewardTokens: t.reward_tokens,
    unlocked,
    unlockedAt,
    progress,
  };
}
