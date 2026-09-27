/**
 * Thống kê bài dự thi cho tác giả (Phase 2, Slice 2.7) — phần thuần: đọc
 * jsonb của get_contest_entry_stats() và dựng 8 ô chỉ số, nguồn độc giả, giữ
 * chân theo chương. Định nghĩa từng chỉ số ở
 * migrations/20260926_add_contest_entry_stats.sql. Không dùng lượt xem trang.
 */
import type { ReadingSource } from "@/lib/supabase/types";
import { formatVnDateTime } from "@/lib/contests/datetime";

export type EntryStats = {
  since: string;
  chapterCount: number;
  readers: number;
  returnReaders: number;
  completedReaders: number;
  /** 0..1; null khi truyện 1 chương. */
  continueRate: number | null;
  avgSessionSeconds: number | null;
  sources: { source: ReadingSource; readers: number }[];
  funnel: { chapterId: string; title: string; position: number; readers: number }[];
  comments: number;
  commenters: number;
  newFollowers: number;
  newFollowers7d: number;
  /** Từ bảng điểm cache — null khi chưa tính lần nào. */
  validReaders: number | null;
  readers7d: number | null;
};

const SOURCES: ReadingSource[] = ["contest", "trending", "search", "profile", "recommendation", "other"];

const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

export function parseEntryStats(raw: unknown): EntryStats {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    since: typeof r.since === "string" ? r.since : "",
    chapterCount: int(r.chapter_count),
    readers: int(r.readers),
    returnReaders: int(r.return_readers),
    completedReaders: int(r.completed_readers),
    continueRate: numOrNull(r.continue_rate),
    avgSessionSeconds: numOrNull(r.avg_session_seconds),
    sources: arr(r.sources).map((s) => ({
      source: (SOURCES as string[]).includes(String(s.source)) ? (s.source as ReadingSource) : "other",
      readers: int(s.readers),
    })),
    funnel: arr(r.funnel).map((f) => ({
      chapterId: String(f.chapter_id ?? ""),
      title: String(f.title ?? ""),
      position: int(f.position),
      readers: int(f.readers),
    })),
    comments: int(r.comments),
    commenters: int(r.commenters),
    newFollowers: int(r.new_followers),
    newFollowers7d: int(r.new_followers_7d),
    validReaders: numOrNull(r.valid_readers),
    readers7d: numOrNull(r.readers_7d),
  };
}

export const SOURCE_LABEL: Record<ReadingSource, string> = {
  contest: "Trang cuộc thi",
  trending: "Trending / Đang tăng tốc",
  search: "Tìm kiếm",
  profile: "Hồ sơ tác giả",
  recommendation: "Gợi ý cho bạn",
  other: "Khác",
};

const fmt = (n: number) => n.toLocaleString("vi-VN");
const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} giây`;
  return `${Math.round(seconds / 60)} phút`;
}

/**
 * Trạng thái ô "Phiếu bình chọn" (P9): trước bình chọn và TRONG lúc bình chọn
 * không có số (trong lúc bình chọn vẫn thấy hạng — Q3); hết bình chọn mới hiện.
 */
export type VoteKpi =
  | { state: "not_open"; opensAt: string | null }
  | { state: "hidden"; rank: number | null }
  | { state: "visible"; votes: number; rank: number | null };

export type Kpi = { key: string; label: string; value: string; sub: string };

function rankText(rank: number | null): string {
  return rank === null ? "ngoài top 100 bảng phiếu bình chọn" : `hạng #${rank} bảng phiếu bình chọn`;
}

export function buildKpis(s: EntryStats, votes: VoteKpi): Kpi[] {
  const voteKpi: Kpi =
    votes.state === "not_open"
      ? { key: "votes", label: "Phiếu bình chọn", value: "—", sub: votes.opensAt ? `mở từ ${formatVnDateTime(votes.opensAt)}` : "chưa mở bình chọn" }
      : votes.state === "hidden"
        ? { key: "votes", label: "Phiếu bình chọn", value: "Ẩn", sub: `công bố khi hết bình chọn · ${rankText(votes.rank)}` }
        : { key: "votes", label: "Phiếu bình chọn", value: fmt(votes.votes), sub: rankText(votes.rank) };

  return [
    {
      key: "valid_readers",
      label: "Độc giả đọc thật",
      value: s.validReaders === null ? "—" : fmt(s.validReaders),
      sub: s.readers7d === null ? "đang tính…" : `+${fmt(s.readers7d)} trong 7 ngày`,
    },
    { key: "return_readers", label: "Độc giả quay lại", value: pct(s.returnReaders, s.readers), sub: "đọc ở ≥ 2 ngày khác nhau" },
    {
      key: "completion",
      label: "Tỷ lệ đọc hết",
      value: pct(s.completedReaders, s.readers),
      sub: s.chapterCount <= 1 ? "truyện 1 chương" : "đọc tới chương cuối",
    },
    {
      key: "continue",
      label: "Đọc tiếp chương sau",
      value: s.continueRate === null ? "—" : `${Math.round(s.continueRate * 100)}%`,
      sub: s.continueRate === null ? "truyện 1 chương" : "trung bình mọi chương",
    },
    { key: "followers", label: "Người theo dõi mới", value: fmt(s.newFollowers), sub: `+${fmt(s.newFollowers7d)} trong 7 ngày` },
    voteKpi,
    { key: "comments", label: "Bình luận", value: fmt(s.comments), sub: `từ ${fmt(s.commenters)} độc giả` },
    { key: "avg_time", label: "Thời gian đọc TB", value: formatDuration(s.avgSessionSeconds), sub: "mỗi phiên" },
  ];
}

/** Nguồn độc giả theo %, đủ 6 nhóm theo thứ tự lớn → nhỏ (nhóm 0% bị bỏ). */
export function sourceShares(s: EntryStats): { source: ReadingSource; label: string; percent: number }[] {
  const total = s.sources.reduce((n, x) => n + x.readers, 0);
  if (total === 0) return [];
  const merged = new Map<ReadingSource, number>();
  for (const x of s.sources) merged.set(x.source, (merged.get(x.source) ?? 0) + x.readers);
  return [...merged.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || SOURCES.indexOf(a[0]) - SOURCES.indexOf(b[0]))
    .map(([source, n]) => ({ source, label: SOURCE_LABEL[source], percent: Math.round((n / total) * 100) }));
}

/** Giữ chân theo chương: % so với người đọc chương 1. */
export function retention(s: EntryStats): { position: number; title: string; readers: number; percent: number }[] {
  const first = s.funnel[0]?.readers ?? 0;
  return s.funnel.map((f) => ({
    position: f.position,
    title: f.title,
    readers: f.readers,
    percent: first > 0 ? Math.round((f.readers / first) * 100) : 0,
  }));
}
