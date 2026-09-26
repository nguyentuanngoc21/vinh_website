"use client";

import { useState } from "react";
import Link from "next/link";
import { InfoIcon, LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui";
import { BookCover } from "@/components/covers/book-cover";
import type { RankingEntry } from "@/lib/contests/feeds";

export type RankingKindTab = { key: "popular" | "final" | "jury" | "trending"; label: string; locked: string | null };

/**
 * RankingBoard — 4 loại xếp hạng, nhãn metric và trạng thái khoá tách khỏi
 * công thức. Phase 1 chỉ có "Độc giả yêu thích" (phiếu hợp lệ); lúc đang bình
 * chọn hiện hạng nhưng ẩn số phiếu (Q3). Mobile: chip cuộn ngang, metric
 * nằm dưới tên, bỏ cột thay đổi (đặc tả UX mục 6).
 */
export function RankingBoard({
  slug,
  kinds,
  initial,
}: {
  slug: string;
  kinds: RankingKindTab[];
  initial: { items: RankingEntry[]; next_cursor: string | null; values_visible: boolean } | null;
}) {
  const [active, setActive] = useState<RankingKindTab["key"]>("popular");
  const [items, setItems] = useState(initial?.items ?? []);
  const [cursor, setCursor] = useState(initial?.next_cursor ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = kinds.find((k) => k.key === active) ?? kinds[0];
  const valuesVisible = initial?.values_visible ?? false;

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/rankings?kind=popular&cursor=${encodeURIComponent(cursor)}`);
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được · Thử lại");
      return;
    }
    setItems((prev) => [...prev, ...data.items]);
    setCursor(data.next_cursor);
  };

  const note =
    kind.key !== "popular"
      ? null
      : valuesVisible
        ? "Chỉ tính phiếu hợp lệ: tài khoản đủ ngày tuổi, đã đọc hết ít nhất 1 chương của tác phẩm."
        : "Số phiếu được ẩn đến khi kết thúc bình chọn để hạn chế hiệu ứng đám đông. Chỉ tính phiếu hợp lệ.";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-ink">Bảng xếp hạng</h2>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:rounded-full sm:bg-neutral-bg sm:p-1 sm:px-1">
          {kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => setActive(k.key)}
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

      {kind.locked ? (
        <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-border-light p-10 text-center">
          <LockSimpleIcon size={30} className="text-brand-gold-dark" />
          <div className="max-w-[440px] text-sm leading-relaxed text-stone-alt">{kind.locked}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">Chưa có tác phẩm trên bảng xếp hạng.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light">
          <div className="hidden grid-cols-[64px_48px_minmax(0,1fr)_140px] gap-3.5 bg-neutral-bg px-5 py-3 text-xs font-semibold tracking-[.4px] text-stone-alt sm:grid">
            <span>HẠNG</span><span /><span>TÁC PHẨM</span><span className="text-right">PHIẾU HỢP LỆ</span>
          </div>
          {items.map((r) => (
            <Link key={r.submission_id} href={`/truyen/${r.book.slug}`}
              className="grid grid-cols-[44px_44px_minmax(0,1fr)] items-center gap-3 border-t border-neutral-bg px-4 py-3 no-underline first:border-t-0 sm:grid-cols-[64px_48px_minmax(0,1fr)_140px] sm:gap-3.5 sm:px-5 sm:first:border-t">
              <span className={`text-lg font-extrabold sm:text-xl ${r.rank === 1 ? "text-brand-gold" : r.rank <= 3 ? "text-brand-gold-light" : "text-stone-light"}`}>
                {r.rank}
                {r.tied && <span className="block text-[10px] font-semibold text-stone-alt">đồng hạng</span>}
              </span>
              <div className="h-[58px] w-[42px] overflow-hidden rounded-md">
                <BookCover id={r.book.id} title={r.book.title} genre={r.book.genre} coverUrl={r.book.coverUrl} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-ink">{r.book.title}</div>
                <div className="truncate text-[12.5px] text-stone-light">{r.book.authorNickname ?? "Ẩn danh"}{r.book.genre ? ` · ${r.book.genre}` : ""}</div>
                <div className="mt-0.5 text-xs font-semibold text-brand-ink sm:hidden">{r.votes === null ? "Số phiếu đang ẩn" : `${r.votes.toLocaleString("vi-VN")} phiếu`}</div>
              </div>
              <span className="hidden text-right text-[15px] font-bold text-brand-ink sm:block">{r.votes === null ? "Ẩn" : r.votes.toLocaleString("vi-VN")}</span>
            </Link>
          ))}
        </div>
      )}

      {!kind.locked && (cursor || error) && (
        <div className="mt-5 flex justify-center">
          <Button type="button" variant="ghost" fullWidth={false} className="px-6 py-2.5 text-sm" disabled={loading} onClick={loadMore}>
            {loading ? "Đang tải…" : (error ?? "Xem thêm")}
          </Button>
        </div>
      )}
    </div>
  );
}
