"use client";

import { useState } from "react";
import Link from "next/link";
import { FireIcon, InfoIcon, LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";
import { BookCover } from "@/components/covers/book-cover";
import { ExclusiveBadge } from "@/components/story/exclusive-badge";
import type { RankingEntry, RankingPage } from "@/lib/contests/feeds";
import { growthLabel } from "@/lib/contests/signals";
import { rankChangeAria, rankChangeText, type RankChange } from "@/lib/contests/rank-change";

export type RankingKindTab = { key: "popular" | "final" | "jury" | "trending"; label: string; locked: string | null };
type LoadableKind = "popular" | "trending" | "final" | "jury";
type KindState = { items: RankingEntry[]; cursor: string | null; valuesVisible: boolean; changesVisible: boolean };

const COLUMN: Record<LoadableKind, string> = {
  popular: "PHIẾU HỢP LỆ",
  trending: "ĐỘC GIẢ MỚI 7 NGÀY",
  final: "ĐIỂM CHUNG CUỘC",
  jury: "ĐIỂM BAN GIÁM KHẢO",
};

function metricText(kind: LoadableKind, r: RankingEntry, short: boolean): string {
  if (kind === "final" || kind === "jury") {
    const score = (r.value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    return short ? score : `${score} điểm`;
  }
  if (kind === "trending") return short ? (r.value ?? 0).toLocaleString("vi-VN") : `${(r.value ?? 0).toLocaleString("vi-VN")} độc giả mới`;
  if (r.value === null) return short ? "Ẩn" : "Số phiếu đang ẩn";
  return short ? r.value.toLocaleString("vi-VN") : `${r.value.toLocaleString("vi-VN")} phiếu`;
}

const fromPage = (p: RankingPage | null): KindState | null =>
  p ? { items: p.items, cursor: p.next_cursor, valuesVisible: p.values_visible, changesVisible: p.changes_visible } : null;

// Desktop: thêm cột "Thay đổi" khi bảng có bản chụp hạng (Slice 3.4). Mobile bỏ cột này (đặc tả UX mục 6).
const DESKTOP_COLS = "sm:grid-cols-[64px_48px_minmax(0,1fr)_140px]";
const DESKTOP_COLS_CHANGE = "sm:grid-cols-[64px_48px_minmax(0,1fr)_140px_76px]";

/**
 * RankingBoard — 4 loại xếp hạng, nhãn metric và trạng thái khoá tách khỏi
 * công thức. "Bảng phiếu bình chọn" (phiếu hợp lệ; lúc đang bình chọn hiện hạng
 * nhưng ẩn số phiếu — Q3), "Trending" (độc giả hợp lệ mới 7 ngày + % tăng, P4),
 * "Chung cuộc" / "Ban giám khảo" (lượt tính đang công bố — Slice 2.6b); mỗi
 * loại giữ trang dữ liệu riêng. Cột "Thay đổi" ▲▼ so với bản chụp 0h giờ VN
 * (Slice 3.4, K9) cho Bảng phiếu lúc bình chọn và Trending. Mobile: chip cuộn
 * ngang, metric nằm dưới tên, bỏ cột thay đổi (đặc tả UX mục 6).
 */
export function RankingBoard({
  slug,
  kinds,
  initial,
  initialKind,
  voteRateNote = false,
}: {
  slug: string;
  kinds: RankingKindTab[];
  initial: Partial<Record<LoadableKind, RankingPage | null>>;
  /** Tab mở sẵn (vd ?kind=trending từ "Xem tất cả" của hàng Đang tăng tốc). */
  initialKind?: RankingKindTab["key"];
  /** J1: cuộc thi chấm chung cuộc — giải "được yêu thích nhất" xét theo tỷ lệ phiếu, không theo bảng này. */
  voteRateNote?: boolean;
}) {
  const [active, setActive] = useState<RankingKindTab["key"]>(initialKind ?? "popular");
  const [pages, setPages] = useState<Partial<Record<LoadableKind, KindState | null>>>(() => ({
    popular: fromPage(initial.popular ?? null),
    trending: fromPage(initial.trending ?? null),
    final: fromPage(initial.final ?? null),
    jury: fromPage(initial.jury ?? null),
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = kinds.find((k) => k.key === active) ?? kinds[0];
  const loadable: LoadableKind = kind.key;
  const page = loadable ? pages[loadable] : null;
  const items = page?.items ?? [];
  const cursor = page?.cursor ?? null;
  const showChange = page?.changesVisible ?? false;
  const cols = showChange ? DESKTOP_COLS_CHANGE : DESKTOP_COLS;

  const load = async (target: LoadableKind, after: string | null) => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ kind: target });
    if (after) qs.set("cursor", after);
    const res = await fetch(`/api/contests/${slug}/rankings?${qs}`);
    const data = (await res.json().catch(() => null)) as RankingPage | null;
    setLoading(false);
    if (!res.ok || !data) {
      setError("Không tải được · Thử lại");
      return;
    }
    setPages((prev) => {
      const before = after ? prev[target] : null;
      return {
        ...prev,
        [target]: {
          items: [...(before?.items ?? []), ...data.items],
          cursor: data.next_cursor,
          valuesVisible: data.values_visible,
          changesVisible: data.changes_visible ?? false,
        },
      };
    });
  };

  // Loại chưa có dữ liệu (vd Trending khi server không nạp sẵn) tải lần đầu khi chọn.
  const select = (key: RankingKindTab["key"]) => {
    setActive(key);
    setError(null);
    const k = kinds.find((x) => x.key === key);
    if (!k?.locked && !pages[key]) void load(key, null);
  };

  const note =
    kind.key === "final"
      ? "Chung cuộc = 50% Ban giám khảo + 50% dữ liệu đọc thật (độc giả, chất lượng đọc, tương tác, bình chọn) trong khung chấm chính thức."
      : kind.key === "jury"
        ? "Điểm trung bình của Ban giám khảo theo thang 100."
        : kind.key === "trending"
      ? "Số độc giả hợp lệ mới trong 7 ngày (đọc đủ lâu, không tính lượt xem trang), kèm mức tăng so với 7 ngày trước đó."
      : kind.key !== "popular"
        ? null
        : page?.valuesVisible
          ? "Chỉ tính phiếu hợp lệ: phiếu của độc giả đã đọc thật tác phẩm (đọc đủ lâu ít nhất 1 chương)."
          : "Số phiếu được ẩn đến khi kết thúc bình chọn để hạn chế hiệu ứng đám đông. Chỉ tính phiếu của độc giả đã đọc thật tác phẩm.";
  // J1: giải "Tác phẩm được yêu thích nhất" xét theo TỶ LỆ phiếu, không theo tổng phiếu của bảng này.
  const popularAwardNote = kind.key === "popular" && voteRateNote;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-ink">Bảng xếp hạng</h2>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:rounded-full sm:bg-neutral-bg sm:p-1 sm:px-1">
          {kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => select(k.key)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold ${
                k.key === active ? "bg-white text-brand-ink shadow-[0_1px_4px_rgb(0_0_0/.08)] ring-1 ring-border-light sm:ring-0" : "bg-neutral-bg text-stone-dark sm:bg-transparent"
              }`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {note && (
        <div className="mb-3.5 flex items-start gap-2 text-[13px] text-stone-alt">
          <InfoIcon size={15} className="mt-0.5 shrink-0" /> {note}
        </div>
      )}
      {popularAwardNote && (
        <div className="mb-3.5 flex items-start gap-2 text-[13px] text-stone-alt">
          <InfoIcon size={15} className="mt-0.5 shrink-0" />
          Giải &ldquo;Tác phẩm được yêu thích nhất&rdquo; xét theo tỷ lệ phiếu hợp lệ trên độc giả đọc thật trong khung chấm, không theo tổng số phiếu của bảng này.
        </div>
      )}

      {kind.locked ? (
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-border-light p-10 text-center">
          <LockSimpleIcon size={30} className="text-brand-gold-dark" />
          <div className="max-w-[440px] text-sm leading-relaxed text-stone-alt">{kind.locked}</div>
        </div>
      ) : !page && loading ? (
        <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">Đang tải…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">
          {kind.key === "trending" ? "Chưa có tác phẩm có độc giả mới trong 7 ngày qua." : "Chưa có tác phẩm trên bảng xếp hạng."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light">
          <div className={`hidden gap-3.5 bg-neutral-bg px-5 py-3 text-xs font-semibold tracking-[.4px] text-stone-alt sm:grid ${cols}`}>
            <span>HẠNG</span><span /><span>TÁC PHẨM</span><span className="text-right">{COLUMN[loadable]}</span>
            {showChange && <span className="text-right">THAY ĐỔI</span>}
          </div>
          {items.map((r) => (
            <Link key={r.submission_id} href={`/truyen/${r.book.slug}?from=cuoc-thi`}
              className={`grid grid-cols-[44px_44px_minmax(0,1fr)] items-center gap-3 border-t border-neutral-bg px-4 py-3 no-underline first:border-t-0 sm:gap-3.5 sm:px-5 sm:first:border-t ${cols}`}>
              <span className={`text-lg font-extrabold sm:text-xl ${r.rank === 1 ? "text-brand-gold" : r.rank <= 3 ? "text-brand-gold-light" : "text-stone-light"}`}>
                {r.rank}
                {r.tied && <span className="block text-[10px] font-semibold text-stone-alt">đồng hạng</span>}
              </span>
              <div className="h-[58px] w-[42px] overflow-hidden rounded-md">
                <BookCover id={r.book.id} title={r.book.title} genre={r.book.genre} coverUrl={r.book.coverUrl} ageRating={r.book.ageRating} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  <span className="truncate">{r.book.title}</span>
                  {r.book.isExclusive && <ExclusiveBadge variant="pill" />}
                </div>
                <div className="truncate text-[12.5px] text-stone-light">{r.book.authorNickname ?? "Ẩn danh"}{r.book.genre ? ` · ${r.book.genre}` : ""}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-brand-ink sm:hidden">
                  {metricText(loadable, r, false)}
                  <GrowthChip entry={r} />
                </div>
              </div>
              <span className="hidden flex-col items-end gap-1 text-right text-[15px] font-bold text-brand-ink sm:flex">
                {metricText(loadable, r, true)}
                <GrowthChip entry={r} />
              </span>
              {showChange && <ChangeCell change={r.change} />}
            </Link>
          ))}
        </div>
      )}

      {!kind.locked && (cursor || error) && (
        <div className="mt-5 flex justify-center">
          <Button type="button" variant="ghost" fullWidth={false} className="px-6 py-2.5 text-sm" disabled={loading}
            onClick={() => load(loadable, page ? cursor : null)}>
            {loading ? "Đang tải…" : (error ?? "Xem thêm")}
          </Button>
        </div>
      )}
    </div>
  );
}

const CHANGE_TONE: Record<RankChange["direction"], string> = {
  up: "text-success-form",
  down: "text-error",
  same: "text-stone-light",
  new: "text-brand-gold-dark",
};

function ChangeCell({ change }: { change: RankChange | null }) {
  if (!change) return <span className="hidden text-right text-sm text-stone-light sm:block">—</span>;
  return (
    <span aria-label={rankChangeAria(change)} title={rankChangeAria(change)}
      className={`hidden text-right text-sm font-bold sm:block ${CHANGE_TONE[change.direction]}`}>
      {rankChangeText(change)}
    </span>
  );
}

function GrowthChip({ entry }: { entry: RankingEntry }) {
  const label = growthLabel(entry.growth);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cream-card px-2 py-0.5 text-[11px] font-semibold text-brand-gold-dark">
      <FireIcon size={11} weight="fill" /> {label}
    </span>
  );
}
