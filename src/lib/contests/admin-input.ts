/**
 * Kiểm dữ liệu admin gửi lên khi tạo/sửa cuộc thi và trao giải — logic
 * thuần (có unit test). Cấu hình eligibility/vote/scoring đi qua
 * config.ts nên DB luôn nhận bản chuẩn hoá đủ khoá.
 *
 * Kiểm tra thứ tự các mốc được làm trên bản ĐÃ GỘP (hiện tại + thay đổi),
 * vì sửa một mốc có thể phá thứ tự với mốc không gửi lên.
 */
import type { Database } from "@/lib/supabase/types";
import {
  normalizeEligibilityRules,
  normalizeScoringConfig,
  normalizeVoteRules,
  type ParseResult,
} from "@/lib/contests/config";
import { TOKEN_TO_VND_RATE } from "@/lib/wallet/config";

type ContestInsert = Database["public"]["Tables"]["contests"]["Insert"];
export type ContestPatch = Omit<ContestInsert, "id" | "status" | "created_by" | "created_at" | "updated_at" | "archived_at" | "legacy_stats" | "results_published_at">;

export type PrizeSummaryItem = { name: string; amount_vnd: number; extra: string };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TEXT_FIELDS = ["title", "short_description", "description", "rules_content", "rules_version"] as const;
const URL_FIELDS = ["key_visual_url", "banner_url"] as const;
const DATE_FIELDS = ["submission_start", "submission_end", "voting_start", "voting_end", "judging_start", "judging_end", "result_at"] as const;
const REQUIRED_DATES = new Set(["submission_start", "submission_end"]);
const KNOWN = new Set<string>([
  "slug", "is_featured", "prizes_summary", "eligibility_rules", "vote_rules", "scoring_config",
  ...TEXT_FIELDS, ...URL_FIELDS, ...DATE_FIELDS,
]);

const MAX_LEN: Record<(typeof TEXT_FIELDS)[number], number> = {
  title: 120,
  short_description: 280,
  description: 20_000,
  rules_content: 50_000,
  rules_version: 20,
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePrizes(v: unknown): PrizeSummaryItem[] | string {
  if (!Array.isArray(v)) return "phải là danh sách";
  const out: PrizeSummaryItem[] = [];
  for (const [i, p] of v.entries()) {
    if (!isObject(p) || typeof p.name !== "string" || p.name.trim() === "") return `giải #${i + 1}: thiếu tên`;
    if (!Number.isInteger(p.amount_vnd) || (p.amount_vnd as number) < 0) return `giải #${i + 1}: số tiền phải là số nguyên ≥ 0`;
    if (p.extra !== undefined && typeof p.extra !== "string") return `giải #${i + 1}: mô tả kèm phải là chuỗi`;
    out.push({ name: p.name.trim(), amount_vnd: p.amount_vnd as number, extra: typeof p.extra === "string" ? p.extra.trim() : "" });
  }
  return out;
}

/**
 * Parse phần thay đổi. `mode: "create"` bắt buộc slug, title, 2 mốc nhận bài.
 * Khoá lạ bị từ chối (không âm thầm bỏ qua).
 */
export function parseContestPatch(body: unknown, mode: "create" | "update"): ParseResult<ContestPatch> {
  if (!isObject(body)) return { ok: false, errors: ["Dữ liệu phải là object"] };
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(body)) if (!KNOWN.has(key)) errors.push(`${key}: không được sửa qua form này`);

  if ("slug" in body) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!SLUG_RE.test(slug) || slug.length > 80) errors.push("slug: chỉ gồm chữ thường không dấu, số và dấu gạch ngang");
    else out.slug = slug;
  } else if (mode === "create") errors.push("slug: bắt buộc");

  for (const f of TEXT_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (typeof v !== "string") { errors.push(`${f}: phải là chuỗi`); continue; }
    const t = f === "rules_content" || f === "description" ? v : v.trim();
    if ((f === "title" || f === "rules_version") && t.trim() === "") errors.push(`${f}: không được để trống`);
    else if (t.length > MAX_LEN[f]) errors.push(`${f}: tối đa ${MAX_LEN[f]} ký tự`);
    else out[f] = t;
  }
  if (mode === "create" && !("title" in body)) errors.push("title: bắt buộc");

  for (const f of URL_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null || v === "") out[f] = null;
    else if (typeof v === "string" && /^https?:\/\/\S+$/.test(v.trim())) out[f] = v.trim();
    else errors.push(`${f}: phải là URL http(s) hoặc để trống`);
  }

  for (const f of DATE_FIELDS) {
    if (!(f in body)) {
      if (mode === "create" && REQUIRED_DATES.has(f)) errors.push(`${f}: bắt buộc`);
      continue;
    }
    const v = body[f];
    if ((v === null || v === "") && !REQUIRED_DATES.has(f)) { out[f] = null; continue; }
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) { errors.push(`${f}: thời điểm không hợp lệ`); continue; }
    out[f] = new Date(v).toISOString();
  }

  if ("is_featured" in body) {
    if (typeof body.is_featured !== "boolean") errors.push("is_featured: phải là true/false");
    else out.is_featured = body.is_featured;
  }

  if ("prizes_summary" in body) {
    const prizes = parsePrizes(body.prizes_summary);
    if (typeof prizes === "string") errors.push(`prizes_summary: ${prizes}`);
    else out.prizes_summary = prizes;
  }

  for (const [key, normalize] of [
    ["eligibility_rules", normalizeEligibilityRules],
    ["vote_rules", normalizeVoteRules],
    ["scoring_config", normalizeScoringConfig],
  ] as const) {
    if (key in body || mode === "create") {
      const r = normalize(body[key]);
      if (r.ok) out[key] = r.value;
      else errors.push(...r.errors);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: out as ContestPatch };
}

type Timeline = Pick<ContestInsert, (typeof DATE_FIELDS)[number]>;

/** Thứ tự các mốc trên bản đã gộp. */
export function validateTimeline(t: Timeline): string[] {
  const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null);
  const s0 = ms(t.submission_start), s1 = ms(t.submission_end);
  const v0 = ms(t.voting_start), v1 = ms(t.voting_end);
  const j0 = ms(t.judging_start), j1 = ms(t.judging_end), r = ms(t.result_at);
  const errors: string[] = [];
  if (s0 === null || s1 === null) errors.push("Cần đủ thời gian mở và đóng nhận bài");
  else if (s0 >= s1) errors.push("Đóng nhận bài phải sau mở nhận bài");
  if ((v0 === null) !== (v1 === null)) errors.push("Bình chọn cần đủ cả thời gian mở và kết thúc");
  if (v0 !== null && v1 !== null) {
    if (v0 >= v1) errors.push("Kết thúc bình chọn phải sau mở bình chọn");
    if (s1 !== null && v0 < s1) errors.push("Bình chọn phải mở sau khi đóng nhận bài");
  }
  if (j0 !== null && j1 !== null && j0 >= j1) errors.push("Kết thúc chấm phải sau bắt đầu chấm");
  const lastBeforeJudging = v1 ?? s1;
  if (j0 !== null && lastBeforeJudging !== null && j0 < lastBeforeJudging) errors.push("Chấm giải phải bắt đầu sau khi kết thúc bình chọn / nhận bài");
  const lastBeforeResult = j1 ?? v1 ?? s1;
  if (r !== null && lastBeforeResult !== null && r < lastBeforeResult) errors.push("Ngày công bố phải sau các giai đoạn trước");
  return errors;
}

export type AwardInput = {
  submission_id: string;
  award_code: string;
  award_name: string;
  award_rank: number | null;
  category: string | null;
  prize_vnd: number;
  token_vnd_rate: number;
  prize_tokens: number;
  prize_extras: string | null;
  badge_icon_url: string | null;
};

/** D10: tiền VND → token theo tỷ giá hiện hành (làm tròn xuống), lưu cả tỷ giá. */
export function vndToTokens(vnd: number, rate: number = TOKEN_TO_VND_RATE): number {
  return Math.floor(vnd / rate);
}

export function parseAwardInput(body: unknown): ParseResult<AwardInput> {
  if (!isObject(body)) return { ok: false, errors: ["Dữ liệu phải là object"] };
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const submission_id = str(body.submission_id);
  if (!/^[0-9a-f-]{36}$/i.test(submission_id)) errors.push("submission_id: không hợp lệ");
  const award_code = str(body.award_code);
  if (!/^[a-z0-9_]+$/.test(award_code)) errors.push("award_code: chỉ gồm chữ thường, số, gạch dưới (vd first_prize)");
  const award_name = str(body.award_name);
  if (!award_name || award_name.length > 80) errors.push("award_name: bắt buộc, tối đa 80 ký tự");
  const rank = body.award_rank ?? null;
  if (rank !== null && (!Number.isInteger(rank) || (rank as number) < 1)) errors.push("award_rank: số nguyên ≥ 1 hoặc để trống");
  const prize = body.prize_vnd ?? 0;
  if (!Number.isInteger(prize) || (prize as number) < 0) errors.push("prize_vnd: số nguyên ≥ 0");
  const badge = str(body.badge_icon_url);
  if (badge && !/^https?:\/\/\S+$/.test(badge)) errors.push("badge_icon_url: phải là URL http(s)");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      submission_id,
      award_code,
      award_name,
      award_rank: rank as number | null,
      category: str(body.category) || null,
      prize_vnd: prize as number,
      token_vnd_rate: TOKEN_TO_VND_RATE,
      prize_tokens: vndToTokens(prize as number),
      prize_extras: str(body.prize_extras) || null,
      badge_icon_url: badge || null,
    },
  };
}
