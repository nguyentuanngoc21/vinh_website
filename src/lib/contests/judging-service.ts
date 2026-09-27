/**
 * Chấm giải (Slice 2.5b): cấu hình chấm có version, giám khảo, phiếu chấm.
 * Xem migrations/20260926_add_contest_judging.sql và
 * docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI (J5–J7, J11).
 *
 *   - Admin: lưu version cấu hình (kiểm bằng parseFinalScoringConfig), gán / gỡ
 *     giám khảo, xem tiến độ chấm, mở lại / huỷ phiếu (kèm lý do).
 *   - Giám khảo: chỉ thấy cuộc thi được gán; đọc BẢN CHỤP lúc đóng nhận bài,
 *     KHÔNG có tên / ảnh tác giả (J7); lưu nháp / chốt phiếu qua RPC.
 * Mọi hàm nhận service-role client; route đã xác thực admin / người dùng.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestStatus, Database, JudgeScorecardStatus } from "@/lib/supabase/types";
import { getContestBySlug } from "@/lib/contests/contest-service";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import { parseFinalScoringConfig, type FinalScoringConfig, type RubricCriterion } from "@/lib/contests/final-scoring/config";

type Client = SupabaseClient<Database>;
type ContestRow = Database["public"]["Tables"]["contests"]["Row"];
type ScorecardRow = Database["public"]["Tables"]["contest_judge_scorecards"]["Row"];

/** Đồng bộ với save_judge_scorecard(): chấm từ lúc đóng nhận bài tới trước khi công bố. */
export const JUDGING_STATUSES: ContestStatus[] = ["submission_closed", "community_voting", "judging"];

// ---------------------------------------------------------------------
// Cấu hình có version
// ---------------------------------------------------------------------

export type ScoringConfigState = {
  activeVersion: number | null;
  active: FinalScoringConfig | null;
  history: { version: number; previous_version: number | null; reason: string | null; created_at: string; created_by_name: string | null }[];
  /** Khung chấm đã bắt đầu → mỗi thay đổi phải có lý do (J11). */
  reasonRequired: boolean;
  /** Đã có phiếu chấm còn hiệu lực → rubric không đổi được. */
  rubricLocked: boolean;
};

export async function getScoringConfigState(client: Client, contest: ContestRow, now: Date = new Date()): Promise<ScoringConfigState> {
  const [versions, cards] = await Promise.all([
    client.from("contest_scoring_configs").select("*").eq("contest_id", contest.id).order("version", { ascending: false }),
    client.from("contest_judge_scorecards").select("id", { count: "exact", head: true }).eq("contest_id", contest.id).neq("status", "invalidated"),
  ]);
  throwIfError(versions.error, "load scoring configs");
  throwIfError(cards.error, "count scorecards");
  const rows = versions.data ?? [];
  const names = await profileNames(client, rows.map((r) => r.created_by));
  const activeRow = rows.find((r) => r.version === contest.scoring_config_version) ?? null;
  const parsed = activeRow ? parseFinalScoringConfig(activeRow.config) : null;
  return {
    activeVersion: contest.scoring_config_version,
    active: parsed?.ok ? parsed.value : null,
    history: rows.map((r) => ({
      version: r.version,
      previous_version: r.previous_version,
      reason: r.reason,
      created_at: r.created_at,
      created_by_name: names.get(r.created_by) ?? null,
    })),
    reasonRequired: contest.official_scoring_start !== null && now.getTime() >= Date.parse(contest.official_scoring_start),
    rubricLocked: (cards.count ?? 0) > 0,
  };
}

export async function saveScoringConfig(
  client: Client,
  input: { contestId: string; adminId: string; config: unknown; reason: string | null }
): Promise<number> {
  const parsed = parseFinalScoringConfig(input.config);
  if (!parsed.ok) throw new ContestError("invalid_input", parsed.errors);
  const { data, error } = await client.rpc("set_contest_scoring_config", {
    p_contest_id: input.contestId,
    p_admin_id: input.adminId,
    p_config: parsed.value as unknown as Record<string, unknown>,
    p_reason: input.reason,
  });
  throwIfError(error, "set_contest_scoring_config");
  return data as number;
}

async function activeRubric(client: Client, contest: ContestRow): Promise<RubricCriterion[] | null> {
  if (contest.scoring_config_version === null) return null;
  const { data, error } = await client
    .from("contest_scoring_configs")
    .select("config")
    .eq("contest_id", contest.id)
    .eq("version", contest.scoring_config_version)
    .maybeSingle();
  throwIfError(error, "load active rubric");
  const parsed = data ? parseFinalScoringConfig(data.config) : null;
  return parsed?.ok ? parsed.value.rubric : null;
}

async function profileNames(client: Client, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => x !== null))];
  if (unique.length === 0) return new Map();
  const { data, error } = await client.from("profiles").select("id, nickname, username").in("id", unique);
  throwIfError(error, "load profile names");
  return new Map((data ?? []).map((p) => [p.id, p.nickname ?? p.username ?? "—"]));
}

// ---------------------------------------------------------------------
// Giám khảo
// ---------------------------------------------------------------------

export type AdminJudge = {
  user_id: string;
  name: string;
  username: string | null;
  assigned_at: string;
  removed_at: string | null;
  removed_reason: string | null;
};

export async function listJudges(client: Client, contestId: string): Promise<AdminJudge[]> {
  const { data, error } = await client.from("contest_judges").select("*").eq("contest_id", contestId).order("assigned_at");
  throwIfError(error, "list judges");
  const rows = data ?? [];
  const { data: profiles, error: pError } = rows.length
    ? await client.from("profiles").select("id, nickname, username").in("id", rows.map((r) => r.user_id))
    : { data: [], error: null };
  throwIfError(pError, "load judge profiles");
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    user_id: r.user_id,
    name: byId.get(r.user_id)?.nickname ?? byId.get(r.user_id)?.username ?? "—",
    username: byId.get(r.user_id)?.username ?? null,
    assigned_at: r.assigned_at,
    removed_at: r.removed_at,
    removed_reason: r.removed_reason,
  }));
}

/** Gán theo username (tài khoản Vịnh sẵn có). Gán lại người đã gỡ → hoạt động lại. */
export async function assignJudge(client: Client, input: { contestId: string; adminId: string; username: string }): Promise<void> {
  const username = input.username.trim().replace(/^@/, "");
  if (!username) throw new ContestError("invalid_input", ["Cần nhập tên đăng nhập của giám khảo"]);
  const { data: profile, error } = await client.from("profiles").select("id").eq("username", username).maybeSingle();
  throwIfError(error, "find judge profile");
  if (!profile) throw new ContestError("user_not_found");
  const { error: upsertError } = await client.from("contest_judges").upsert(
    {
      contest_id: input.contestId,
      user_id: profile.id,
      assigned_by: input.adminId,
      assigned_at: new Date().toISOString(),
      removed_at: null,
      removed_by: null,
      removed_reason: null,
    },
    { onConflict: "contest_id,user_id" }
  );
  throwIfError(upsertError, "assign judge");
}

/** J5: gỡ giám khảo → phiếu của người đó không vào điểm (lượt tính chỉ đọc giám khảo đang gán). */
export async function removeJudge(client: Client, input: { contestId: string; userId: string; adminId: string; reason: string | null }): Promise<void> {
  if (!input.reason) throw new ContestError("reason_required");
  const { data, error } = await client
    .from("contest_judges")
    .update({ removed_at: new Date().toISOString(), removed_by: input.adminId, removed_reason: input.reason })
    .eq("contest_id", input.contestId)
    .eq("user_id", input.userId)
    .is("removed_at", null)
    .select("user_id");
  throwIfError(error, "remove judge");
  if (!data?.length) throw new ContestError("judge_not_found");
}

// ---------------------------------------------------------------------
// Tiến độ chấm (admin) + mở lại / huỷ phiếu
// ---------------------------------------------------------------------

export type JudgingOverview = {
  judges: { user_id: string; name: string }[];
  entries: {
    submission_id: string;
    book_title: string;
    author_name: string;
    cards: Record<string, Pick<ScorecardRow, "id" | "status" | "total" | "finalized_at" | "updated_at"> | null>;
  }[];
  /** Phiếu đã chốt / phiếu cần có (mỗi giám khảo đang gán × mỗi bài hợp lệ). */
  progress: { finalized: number; required: number };
  events: { id: string; action: string; actor_name: string; book_title: string; reason: string | null; created_at: string }[];
};

export async function getJudgingOverview(client: Client, contestId: string): Promise<JudgingOverview> {
  const [judgesRes, subsRes, cardsRes, eventsRes] = await Promise.all([
    client.from("contest_judges").select("user_id").eq("contest_id", contestId).is("removed_at", null),
    client.from("contest_submissions").select("id, book_id, author_id").eq("contest_id", contestId).in("status", ["eligible", "shortlisted"]),
    client.from("contest_judge_scorecards").select("id, submission_id, judge_id, status, total, finalized_at, updated_at").eq("contest_id", contestId).neq("status", "invalidated"),
    client.from("contest_judge_score_events").select("id, scorecard_id, actor_id, action, reason, created_at").eq("contest_id", contestId).order("created_at", { ascending: false }).limit(50),
  ]);
  throwIfError(judgesRes.error, "overview judges");
  throwIfError(subsRes.error, "overview submissions");
  throwIfError(cardsRes.error, "overview scorecards");
  throwIfError(eventsRes.error, "overview events");
  const judgeIds = (judgesRes.data ?? []).map((j) => j.user_id);
  const subs = subsRes.data ?? [];
  const cards = cardsRes.data ?? [];
  const events = eventsRes.data ?? [];

  const eventCardIds = [...new Set(events.map((e) => e.scorecard_id))];
  const [names, books, eventCards] = await Promise.all([
    profileNames(client, [...judgeIds, ...subs.map((s) => s.author_id), ...events.map((e) => e.actor_id)]),
    subs.length ? client.from("books").select("id, title").in("id", subs.map((s) => s.book_id)) : Promise.resolve({ data: [], error: null }),
    eventCardIds.length ? client.from("contest_judge_scorecards").select("id, submission_id").in("id", eventCardIds) : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(books.error, "overview books");
  throwIfError(eventCards.error, "overview event cards");
  const titleByBook = new Map((books.data ?? []).map((b) => [b.id, b.title]));
  const titleBySub = new Map(subs.map((s) => [s.id, titleByBook.get(s.book_id) ?? "—"]));
  const subByCard = new Map((eventCards.data ?? []).map((c) => [c.id, c.submission_id]));

  const activeJudges = new Set(judgeIds);
  return {
    judges: judgeIds.map((id) => ({ user_id: id, name: names.get(id) ?? "—" })),
    entries: subs.map((s) => ({
      submission_id: s.id,
      book_title: titleBySub.get(s.id) ?? "—",
      author_name: names.get(s.author_id) ?? "—",
      cards: Object.fromEntries(
        judgeIds.map((j) => {
          const c = cards.find((x) => x.submission_id === s.id && x.judge_id === j);
          return [j, c ? { id: c.id, status: c.status, total: Number(c.total), finalized_at: c.finalized_at, updated_at: c.updated_at } : null];
        })
      ),
    })),
    progress: {
      finalized: cards.filter((c) => c.status === "finalized" && activeJudges.has(c.judge_id) && titleBySub.has(c.submission_id)).length,
      required: judgeIds.length * subs.length,
    },
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      actor_name: names.get(e.actor_id) ?? "—",
      book_title: titleBySub.get(subByCard.get(e.scorecard_id) ?? "") ?? "—",
      reason: e.reason,
      created_at: e.created_at,
    })),
  };
}

export async function reviewScorecard(
  client: Client,
  input: { contestId: string; scorecardId: string; adminId: string; action: "reopen" | "invalidate"; reason: string | null }
): Promise<ScorecardRow> {
  const { data: existing, error: loadError } = await client
    .from("contest_judge_scorecards").select("id").eq("id", input.scorecardId).eq("contest_id", input.contestId).maybeSingle();
  throwIfError(loadError, "load scorecard");
  if (!existing) throw new ContestError("scorecard_not_found");
  const { data, error } = await client.rpc("review_judge_scorecard", {
    p_scorecard_id: input.scorecardId,
    p_admin_id: input.adminId,
    p_action: input.action,
    p_reason: input.reason ?? "",
  });
  throwIfError(error, "review_judge_scorecard");
  return data as ScorecardRow;
}

// ---------------------------------------------------------------------
// Giám khảo — màn chấm (ẩn danh tác giả, đọc bản chụp)
// ---------------------------------------------------------------------

async function requireJudge(client: Client, contestId: string, judgeId: string) {
  const { data, error } = await client
    .from("contest_judges").select("user_id").eq("contest_id", contestId).eq("user_id", judgeId).is("removed_at", null).maybeSingle();
  throwIfError(error, "check judge");
  if (!data) throw new ContestError("not_judge");
}

export type JudgeContestSummary = { slug: string; title: string; status: ContestStatus; entries: number; finalized: number };

export async function listJudgeContests(client: Client, judgeId: string): Promise<JudgeContestSummary[]> {
  const { data: rows, error } = await client.from("contest_judges").select("contest_id").eq("user_id", judgeId).is("removed_at", null);
  throwIfError(error, "list judge contests");
  const ids = (rows ?? []).map((r) => r.contest_id);
  if (ids.length === 0) return [];
  const [contests, subs, cards] = await Promise.all([
    client.from("contests").select("id, slug, title, status").in("id", ids).neq("status", "draft").order("submission_end", { ascending: false }),
    client.from("contest_submissions").select("id, contest_id").in("contest_id", ids).in("status", ["eligible", "shortlisted"]),
    client.from("contest_judge_scorecards").select("submission_id, contest_id").in("contest_id", ids).eq("judge_id", judgeId).eq("status", "finalized"),
  ]);
  throwIfError(contests.error, "judge contests");
  throwIfError(subs.error, "judge contest entries");
  throwIfError(cards.error, "judge contest cards");
  const eligible = new Set((subs.data ?? []).map((s) => s.id));
  return (contests.data ?? []).map((c) => ({
    slug: c.slug,
    title: c.title,
    status: c.status,
    entries: (subs.data ?? []).filter((s) => s.contest_id === c.id).length,
    finalized: (cards.data ?? []).filter((x) => x.contest_id === c.id && eligible.has(x.submission_id)).length,
  }));
}

export type JudgeEntrySummary = {
  submission_id: string;
  /** Mã ẩn danh ổn định trong cuộc thi (theo thứ tự nộp) — không lộ tác giả. */
  code: string;
  book_title: string;
  genre: string | null;
  chapter_count: number;
  total_words: number;
  snapshot_ready: boolean;
  mine: { status: JudgeScorecardStatus; total: number } | null;
};

export type JudgeContestView = {
  contest: Pick<ContestRow, "id" | "slug" | "title" | "status">;
  rubric: RubricCriterion[] | null;
  canScore: boolean;
  entries: JudgeEntrySummary[];
};

export async function getJudgeContest(client: Client, input: { slug: string; judgeId: string }): Promise<JudgeContestView> {
  const contest = await getContestBySlug(client, input.slug);
  await requireJudge(client, contest.id, input.judgeId);
  // Bản chụp có thể chưa có nếu cron chưa chạy — chụp bù (idempotent, D3/Q1).
  if (contest.status !== "announced" && contest.status !== "submission_open") {
    const { error } = await client.rpc("snapshot_contest_submissions", { p_contest_id: contest.id });
    if (error) console.error("[contests] snapshot on judge view failed:", error);
  }
  const [rubric, subs, snaps, cards] = await Promise.all([
    activeRubric(client, contest),
    client.from("contest_submissions").select("id, submitted_at").eq("contest_id", contest.id).in("status", ["eligible", "shortlisted"]).order("submitted_at").order("id"),
    client.from("contest_submission_snapshots").select("submission_id, book_title, genre, chapter_count, total_words").eq("contest_id", contest.id).eq("reason", "submission_closed"),
    client.from("contest_judge_scorecards").select("submission_id, status, total").eq("contest_id", contest.id).eq("judge_id", input.judgeId).neq("status", "invalidated"),
  ]);
  throwIfError(subs.error, "judge entries");
  throwIfError(snaps.error, "judge snapshots");
  throwIfError(cards.error, "judge cards");
  const snapBySub = new Map((snaps.data ?? []).map((s) => [s.submission_id, s]));
  const cardBySub = new Map((cards.data ?? []).map((c) => [c.submission_id, c]));
  return {
    contest: { id: contest.id, slug: contest.slug, title: contest.title, status: contest.status },
    rubric,
    canScore: JUDGING_STATUSES.includes(contest.status) && rubric !== null,
    entries: (subs.data ?? []).map((s, i) => {
      const snap = snapBySub.get(s.id);
      const card = cardBySub.get(s.id);
      return {
        submission_id: s.id,
        code: `#${String(i + 1).padStart(2, "0")}`,
        book_title: snap?.book_title ?? "Bản chụp chưa sẵn sàng",
        genre: snap?.genre ?? null,
        chapter_count: snap?.chapter_count ?? 0,
        total_words: snap?.total_words ?? 0,
        snapshot_ready: Boolean(snap),
        mine: card ? { status: card.status, total: Number(card.total) } : null,
      };
    }),
  };
}

export type JudgeEntryView = {
  contest: JudgeContestView["contest"];
  rubric: RubricCriterion[] | null;
  canScore: boolean;
  entry: JudgeEntrySummary & { synopsis: string | null; tags: string[] };
  chapters: { index: number; title: string; word_count: number }[];
  chapter: { index: number; title: string; paragraphs: string[] } | null;
  scorecard: { id: string; status: JudgeScorecardStatus; total: number; note: string | null; scores: Record<string, number> } | null;
  prevId: string | null;
  nextId: string | null;
};

export async function getJudgeEntry(
  client: Client,
  input: { slug: string; submissionId: string; judgeId: string; chapterIndex: number }
): Promise<JudgeEntryView> {
  const view = await getJudgeContest(client, { slug: input.slug, judgeId: input.judgeId });
  const pos = view.entries.findIndex((e) => e.submission_id === input.submissionId);
  if (pos < 0) throw new ContestError("submission_not_found");
  const entry = view.entries[pos];

  const { data: snap, error } = await client
    .from("contest_submission_snapshots").select("id, synopsis, tags").eq("submission_id", entry.submission_id).eq("reason", "submission_closed").maybeSingle();
  throwIfError(error, "load snapshot");
  const { data: chapterRows, error: chError } = snap
    ? await client.from("contest_submission_snapshot_chapters").select("order_index, title, word_count").eq("snapshot_id", snap.id).order("order_index")
    : { data: [], error: null };
  throwIfError(chError, "load snapshot chapters");
  const chapters = (chapterRows ?? []).map((c, i) => ({ index: i + 1, title: c.title, word_count: c.word_count }));

  let chapter: JudgeEntryView["chapter"] = null;
  const target = chapters.find((c) => c.index === input.chapterIndex) ?? chapters[0];
  if (snap && target) {
    const { data: row, error: rowError } = await client
      .from("contest_submission_snapshot_chapters").select("title, content").eq("snapshot_id", snap.id)
      .order("order_index").range(target.index - 1, target.index - 1).maybeSingle();
    throwIfError(rowError, "load snapshot chapter");
    if (row) chapter = { index: target.index, title: row.title, paragraphs: row.content.split("\n\n").filter((p) => p.trim() !== "") };
  }

  const { data: card, error: cardError } = await client
    .from("contest_judge_scorecards").select("id, status, total, note")
    .eq("contest_id", view.contest.id).eq("submission_id", entry.submission_id).eq("judge_id", input.judgeId).neq("status", "invalidated").maybeSingle();
  throwIfError(cardError, "load my scorecard");
  let scores: Record<string, number> = {};
  if (card) {
    const { data: rows, error: sError } = await client.from("contest_judge_criterion_scores").select("criterion_code, score").eq("scorecard_id", card.id);
    throwIfError(sError, "load my criterion scores");
    scores = Object.fromEntries((rows ?? []).map((r) => [r.criterion_code, Number(r.score)]));
  }

  return {
    contest: view.contest,
    rubric: view.rubric,
    canScore: view.canScore,
    entry: { ...entry, synopsis: snap?.synopsis ?? null, tags: snap?.tags ?? [] },
    chapters,
    chapter,
    scorecard: card ? { id: card.id, status: card.status, total: Number(card.total), note: card.note, scores } : null,
    prevId: view.entries[pos - 1]?.submission_id ?? null,
    nextId: view.entries[pos + 1]?.submission_id ?? null,
  };
}

export async function saveMyScorecard(
  client: Client,
  input: { slug: string; submissionId: string; judgeId: string; scores: Record<string, number>; note: string | null; finalize: boolean }
): Promise<ScorecardRow> {
  const contest = await getContestBySlug(client, input.slug);
  await requireJudge(client, contest.id, input.judgeId);
  const { data, error } = await client.rpc("save_judge_scorecard", {
    p_contest_id: contest.id,
    p_submission_id: input.submissionId,
    p_judge_id: input.judgeId,
    p_scores: input.scores,
    p_note: input.note,
    p_finalize: input.finalize,
  });
  throwIfError(error, "save_judge_scorecard");
  return data as ScorecardRow;
}
