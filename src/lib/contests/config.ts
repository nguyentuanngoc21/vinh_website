/**
 * Cấu hình cuộc thi — nơi DUY NHẤT định nghĩa khoá hợp lệ và giá trị mặc
 * định của contests.eligibility_rules / vote_rules / scoring_config.
 *
 * Admin API luôn lưu kết quả của normalize*() (đủ mọi khoá, đúng kiểu), nên
 * DB không cần bộ default thứ hai: trigger contests_guard_write chỉ kiểm đủ
 * khoá lúc rời 'draft', rồi RPC đọc thẳng jsonb (xem
 * migrations/20260926_add_contest_engine_core.sql). Khoá lạ bị từ chối để
 * lỗi đánh máy không âm thầm tắt một luật.
 */
import { genres } from "@/lib/books";

export type EligibilityRules = {
  /** Cho nộp lại cùng sách sau khi rút (D6). */
  allow_resubmit_after_withdraw: boolean;
  /** Chỉ nhận sách độc quyền trên Vịnh (D11) — khác với allow_multi_contest. */
  require_exclusive: boolean;
  /** false = "Chỉ dự thi cuộc thi này": sách không được đồng thời dự cuộc thi khác. */
  allow_multi_contest: boolean;
  max_entries_per_author: number | null;
  min_published_chapters: number | null;
  min_words: number | null;
  max_words: number | null;
  /** null = mọi thể loại. */
  allowed_genres: string[] | null;
  required_tags: string[];
  /** ISO timestamp — sách phải xuất bản lần đầu từ mốc này (books.published_at). */
  first_published_after: string | null;
  /** Chặn sách từng có bài hợp lệ ở cuộc thi đã kết thúc. */
  no_prior_entries: boolean;
  /** Chặn sách từng đạt giải (giải chưa thu hồi) ở cuộc thi khác. */
  no_prior_awards: boolean;
  email_verified: boolean;
  /** Tuổi tối thiểu của tác giả theo profiles.date_of_birth (Q7). */
  min_author_age: number | null;
};

export type VoteRules = {
  min_account_age_days: number;
  require_completed_chapter: boolean;
};

export type ScoringConfig = {
  /** Mã công thức điểm Độc giả yêu thích — src/lib/contests/scoring/. */
  popular_formula_id: "popular-v1";
};

export const DEFAULT_ELIGIBILITY_RULES: EligibilityRules = {
  allow_resubmit_after_withdraw: false,
  require_exclusive: false,
  allow_multi_contest: true,
  max_entries_per_author: null,
  min_published_chapters: 1,
  min_words: null,
  max_words: null,
  allowed_genres: null,
  required_tags: [],
  first_published_after: null,
  no_prior_entries: false,
  no_prior_awards: false,
  email_verified: true,
  min_author_age: null,
};

export const DEFAULT_VOTE_RULES: VoteRules = {
  min_account_age_days: 7,
  require_completed_chapter: true,
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  popular_formula_id: "popular-v1",
};

/** Số truyện ở khối "Top truyện" trên microsite (Q3). */
export const TOP_ENTRIES_COUNT = 5;
/** Countdown chuyển giờ:phút và hiện chip "Sắp đóng" khi còn dưới mốc này. */
export const CLOSING_SOON_HOURS = 48;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const GENRE_LABELS = new Set(genres.map((g) => g.label));

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type FieldCheck = (value: unknown) => string | null;

const nonNegativeIntOrNull: FieldCheck = (v) =>
  v === null || (Number.isInteger(v) && (v as number) >= 0) ? null : "phải là số nguyên ≥ 0 hoặc null";
const positiveIntOrNull: FieldCheck = (v) =>
  v === null || (Number.isInteger(v) && (v as number) > 0) ? null : "phải là số nguyên > 0 hoặc null";
const bool: FieldCheck = (v) => (typeof v === "boolean" ? null : "phải là true/false");
const stringList: FieldCheck = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim() !== "") ? null : "phải là danh sách chuỗi";
const isoOrNull: FieldCheck = (v) =>
  v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v))) ? null : "phải là thời điểm ISO hoặc null";

const ELIGIBILITY_FIELDS: Record<keyof EligibilityRules, FieldCheck> = {
  allow_resubmit_after_withdraw: bool,
  require_exclusive: bool,
  allow_multi_contest: bool,
  max_entries_per_author: positiveIntOrNull,
  min_published_chapters: positiveIntOrNull,
  min_words: nonNegativeIntOrNull,
  max_words: positiveIntOrNull,
  allowed_genres: (v) => {
    if (v === null) return null;
    const base = stringList(v);
    if (base) return base;
    const unknown = (v as string[]).filter((g) => !GENRE_LABELS.has(g));
    return unknown.length ? `có thể loại không tồn tại: ${unknown.join(", ")}` : null;
  },
  required_tags: stringList,
  first_published_after: isoOrNull,
  no_prior_entries: bool,
  no_prior_awards: bool,
  email_verified: bool,
  min_author_age: positiveIntOrNull,
};

const VOTE_FIELDS: Record<keyof VoteRules, FieldCheck> = {
  min_account_age_days: (v) => (Number.isInteger(v) && (v as number) >= 0 ? null : "phải là số nguyên ≥ 0"),
  require_completed_chapter: bool,
};

const SCORING_FIELDS: Record<keyof ScoringConfig, FieldCheck> = {
  popular_formula_id: (v) => (v === "popular-v1" ? null : "chỉ hỗ trợ popular-v1"),
};

/** Gộp input (một phần) lên default, kiểm từng khoá. Khoá lạ → lỗi. */
function normalize<T extends Record<string, unknown>>(
  input: unknown,
  defaults: T,
  fields: Record<keyof T, FieldCheck>,
  label: string
): ParseResult<T> {
  if (input === undefined || input === null) return { ok: true, value: { ...defaults } };
  if (!isPlainObject(input)) return { ok: false, errors: [`${label} phải là object`] };

  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!(key in fields)) errors.push(`${label}.${key}: khoá không được hỗ trợ`);
  }
  const value = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(fields) as (keyof T & string)[]) {
    if (!(key in input)) continue;
    const raw = input[key];
    const problem = fields[key](raw);
    if (problem) errors.push(`${label}.${key}: ${problem}`);
    else value[key] = Array.isArray(raw) ? raw.map((x) => (x as string).trim()) : raw;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: value as T };
}

export function normalizeEligibilityRules(input: unknown): ParseResult<EligibilityRules> {
  const result = normalize(input, DEFAULT_ELIGIBILITY_RULES, ELIGIBILITY_FIELDS, "eligibility_rules");
  if (!result.ok) return result;
  const r = result.value;
  if (r.min_words !== null && r.max_words !== null && r.min_words > r.max_words) {
    return { ok: false, errors: ["eligibility_rules: min_words không được lớn hơn max_words"] };
  }
  return result;
}

export function normalizeVoteRules(input: unknown): ParseResult<VoteRules> {
  return normalize(input, DEFAULT_VOTE_RULES, VOTE_FIELDS, "vote_rules");
}

export function normalizeScoringConfig(input: unknown): ParseResult<ScoringConfig> {
  return normalize(input, DEFAULT_SCORING_CONFIG, SCORING_FIELDS, "scoring_config");
}

/**
 * Đọc cấu hình đã lưu trong DB. Dữ liệu trong DB luôn do normalize*() ghi,
 * nên lỗi ở đây là dữ liệu hỏng — ném lỗi thay vì âm thầm dùng default.
 */
export function readContestConfig(contest: {
  eligibility_rules: unknown;
  vote_rules: unknown;
  scoring_config: unknown;
}): { eligibility: EligibilityRules; vote: VoteRules; scoring: ScoringConfig } {
  const eligibility = normalizeEligibilityRules(contest.eligibility_rules);
  const vote = normalizeVoteRules(contest.vote_rules);
  const scoring = normalizeScoringConfig(contest.scoring_config);
  const errors = [
    ...(eligibility.ok ? [] : eligibility.errors),
    ...(vote.ok ? [] : vote.errors),
    ...(scoring.ok ? [] : scoring.errors),
  ];
  if (!eligibility.ok || !vote.ok || !scoring.ok) {
    throw new Error(`Cấu hình cuộc thi không hợp lệ: ${errors.join("; ")}`);
  }
  return { eligibility: eligibility.value, vote: vote.value, scoring: scoring.value };
}
