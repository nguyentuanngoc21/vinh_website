/**
 * Quy tắc xếp hạng dùng chung cho mọi loại BXH (mục VII.2 của
 * docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md). Hạng do SQL tính
 * (get_contest_ranking — rank() toàn cục, đúng cả khi phân trang); module
 * này giữ thứ tự sắp và cursor để route phân trang.
 *
 *   - Thứ tự tất định: value giảm dần, submitted_at tăng dần, id tăng dần —
 *     id là khoá cuối nên không bao giờ có 2 dòng hoà hoàn toàn.
 *   - Đồng hạng kiểu rank(): cùng value → cùng hạng, hạng sau nhảy qua (1, 2, 2, 4).
 *   - Phân trang keyset: cursor = (rank, submitted_at, id) của dòng cuối trang —
 *     dùng hạng thay vì số phiếu để cursor không lộ số phiếu đang bị ẩn (Q3).
 */
export type RankingKind = "popular" | "trending" | "jury" | "final";

export type RankedRow = { submission_id: string; value: number; submitted_at: string };

export function compareRanked(a: RankedRow, b: RankedRow): number {
  if (a.value !== b.value) return b.value - a.value;
  const at = Date.parse(a.submitted_at);
  const bt = Date.parse(b.submitted_at);
  if (at !== bt) return at - bt;
  return a.submission_id < b.submission_id ? -1 : a.submission_id > b.submission_id ? 1 : 0;
}

export type RankingCursor = { rank: number; submitted_at: string; id: string };

function toBase64Url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), "utf8").toString("base64url");
}

function fromBase64Url(raw: string): unknown {
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

export function encodeRankingCursor(c: RankingCursor): string {
  return toBase64Url(c);
}

/** null khi không có cursor; "invalid" khi cursor hỏng — route trả 400, không đoán. */
export function decodeRankingCursor(raw: string | null | undefined): RankingCursor | null | "invalid" {
  if (!raw) return null;
  try {
    const c = fromBase64Url(raw) as Partial<RankingCursor>;
    const ok =
      typeof c?.rank === "number" && Number.isInteger(c.rank) && c.rank > 0 &&
      typeof c?.submitted_at === "string" && !Number.isNaN(Date.parse(c.submitted_at)) &&
      typeof c?.id === "string" && c.id !== "";
    return ok ? { rank: c.rank!, submitted_at: c.submitted_at!, id: c.id! } : "invalid";
  } catch {
    return "invalid";
  }
}

/** Cursor của feed (sort_key + id của dòng cuối) — get_contest_entries. */
export type FeedCursor = { key: string; id: string };

export function encodeFeedCursor(c: FeedCursor): string {
  return toBase64Url(c);
}

export function decodeFeedCursor(raw: string | null | undefined): FeedCursor | null | "invalid" {
  if (!raw) return null;
  try {
    const c = fromBase64Url(raw) as Partial<FeedCursor>;
    return typeof c?.key === "string" && typeof c?.id === "string" && c.id !== "" ? { key: c.key, id: c.id } : "invalid";
  } catch {
    return "invalid";
  }
}

/**
 * Seed cho feed "Truyện đề xuất" (ngẫu nhiên): cố định theo ngày (giờ Việt
 * Nam) + người xem, nên phân trang ổn định và không lặp bài trong ngày, còn
 * mỗi người/mỗi ngày thấy một thứ tự khác. SQL sắp theo md5(id || seed).
 */
export function discoverSeed(viewerId: string | null, now: Date): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return `${day}:${viewerId ?? "anon"}`;
}
