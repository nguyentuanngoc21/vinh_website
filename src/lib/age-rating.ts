/**
 * Nhãn độ tuổi + cảnh báo nội dung cấp TRUYỆN (books.age_rating,
 * books.content_warnings) — xem migrations/20261002_book_age_ratings.sql.
 *
 * Mỗi cảnh báo kéo theo 1 độ tuổi tối thiểu: chọn "Tình dục rõ ràng" thì
 * truyện tự thành 18+, không chọn thấp hơn được. DB chặn lại đúng luật này
 * bằng CHECK (books_age_rating_warnings_check) — danh sách ở đây và ở
 * migration phải khớp nhau.
 *
 * Cổng đọc:
 * - 18+: chỉ tài khoản đã xác thực tuổi qua CCCD (năm sinh lấy từ số CCCD,
 *   xem public.is_age_verified_adult) mới nhận được nội dung chương — chặn ở
 *   RLS chapters + route đọc, không chỉ ở giao diện.
 * - 16+: chỉ 1 màn hình tự xác nhận "Tôi đủ 16 tuổi" ở giao diện.
 */

export const AGE_RATINGS = ["all", "16", "18"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

export const AGE_RATING_LABELS: Record<AgeRating, string> = {
  all: "Mọi lứa tuổi",
  "16": "16+",
  "18": "18+",
};

export const AGE_RATING_DESCRIPTIONS: Record<AgeRating, string> = {
  all: "Không có nội dung cần cảnh báo.",
  "16": "Bạo lực, kinh dị, chủ đề nặng ở mức vừa. Người đọc tự xác nhận đủ 16 tuổi.",
  "18": "Tình dục rõ ràng, bạo lực/máu me nặng. Chỉ tài khoản đã xác thực tuổi qua CCCD được đọc.",
};

export const CONTENT_WARNINGS = [
  { id: "violence", label: "Bạo lực", minRating: "16" },
  { id: "gore", label: "Máu me", minRating: "16" },
  { id: "gore_extreme", label: "Máu me / tra tấn nặng", minRating: "18" },
  { id: "sexual_mild", label: "Nội dung tình dục nhẹ", minRating: "16" },
  { id: "sexual_explicit", label: "Tình dục rõ ràng", minRating: "18" },
  { id: "self_harm", label: "Tự hại / tự sát", minRating: "16" },
  { id: "abuse", label: "Xâm hại / lạm dụng", minRating: "18" },
  { id: "domestic_violence", label: "Bạo hành gia đình", minRating: "16" },
  { id: "horror", label: "Kinh dị / ám ảnh tâm lý", minRating: "16" },
  { id: "substances", label: "Chất kích thích", minRating: "16" },
  { id: "profanity", label: "Ngôn từ thô tục", minRating: "16" },
] as const satisfies readonly { id: string; label: string; minRating: Exclude<AgeRating, "all"> }[];

export type ContentWarning = (typeof CONTENT_WARNINGS)[number]["id"];

const WARNING_BY_ID = new Map<string, (typeof CONTENT_WARNINGS)[number]>(CONTENT_WARNINGS.map((w) => [w.id, w]));
const RANK: Record<AgeRating, number> = { all: 0, "16": 1, "18": 2 };

export function isAgeRating(value: unknown): value is AgeRating {
  return typeof value === "string" && (AGE_RATINGS as readonly string[]).includes(value);
}

export function contentWarningLabel(id: string): string {
  return WARNING_BY_ID.get(id)?.label ?? id;
}

/** Độ tuổi thấp nhất được phép với bộ cảnh báo này. */
export function minRatingForWarnings(warnings: readonly string[]): AgeRating {
  let min: AgeRating = "all";
  for (const id of warnings) {
    const w = WARNING_BY_ID.get(id);
    if (w && RANK[w.minRating] > RANK[min]) min = w.minRating;
  }
  return min;
}

export function ratingAtLeast(rating: AgeRating, floor: AgeRating): boolean {
  return RANK[rating] >= RANK[floor];
}

/**
 * Chuẩn hoá input từ client (route tác giả + admin): bỏ cảnh báo lạ/trùng,
 * giữ thứ tự CONTENT_WARNINGS, và NÂNG độ tuổi lên mức tối thiểu cảnh báo
 * yêu cầu (không báo lỗi — giao diện vốn đã khoá các lựa chọn thấp hơn).
 * null = input không hợp lệ.
 */
export function normalizeAgeRating(
  rating: unknown,
  warnings: unknown
): { ageRating: AgeRating; contentWarnings: ContentWarning[] } | null {
  if (!isAgeRating(rating)) return null;
  if (!Array.isArray(warnings) || !warnings.every((w) => typeof w === "string")) return null;
  const picked = new Set(warnings);
  const contentWarnings = CONTENT_WARNINGS.filter((w) => picked.has(w.id)).map((w) => w.id);
  const floor = minRatingForWarnings(contentWarnings);
  return { ageRating: ratingAtLeast(rating, floor) ? rating : floor, contentWarnings };
}
