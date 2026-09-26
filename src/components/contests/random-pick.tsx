"use client";

import { useState } from "react";
import Link from "next/link";
import { DiceFiveIcon, ShuffleIcon } from "@phosphor-icons/react/dist/ssr";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

/**
 * "Không biết đọc gì?" — chọn ngẫu nhiên 1 tác phẩm dự thi hợp lệ, không
 * dựa trên lượt đọc hay điểm số. Chọn trong danh sách "Truyện đề xuất" đã
 * tải sẵn (đã xáo theo seed), bấm lại để đổi.
 */
export function RandomPick({ pool, variant = "card" }: { pool: HomepageBook[]; variant?: "card" | "banner" }) {
  const [index, setIndex] = useState<number | null>(null);
  if (pool.length === 0) return null;
  const pick = index === null ? null : pool[index];

  const roll = () => {
    if (pool.length === 1) return setIndex(0);
    let next: number;
    do next = Math.floor(Math.random() * pool.length);
    while (next === index);
    setIndex(next);
  };

  const button = (
    <button type="button" onClick={roll}
      className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full bg-brand-ink px-5 py-3 text-[14.5px] font-semibold text-white">
      <DiceFiveIcon size={17} weight="bold" /> {pick ? "Đổi tác phẩm khác" : "Khám phá một tác phẩm"}
    </button>
  );

  const picked = pick && (
    <Link href={`/truyen/${pick.slug}?from=cuoc-thi`} className="flex items-center gap-3 rounded-[14px] bg-white p-2.5 no-underline">
      <div className="h-[62px] w-[46px] shrink-0 overflow-hidden rounded-lg">
        <BookCover id={pick.id} title={pick.title} genre={pick.genre} coverUrl={pick.coverUrl} className="h-full w-full" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-semibold text-ink">{pick.title}</div>
        <div className="truncate text-[12.5px] text-stone-alt">{pick.authorNickname ?? "Ẩn danh"}{pick.genre ? ` · ${pick.genre}` : ""}</div>
        <div className="mt-1 text-[12.5px] font-semibold text-brand-gold-dark">Đọc ngay →</div>
      </div>
    </Link>
  );

  if (variant === "banner") {
    return (
      <div className="flex flex-col gap-4 rounded-[18px] border border-cream-gold-border bg-cream-gold px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <ShuffleIcon size={26} weight="fill" className="shrink-0 text-brand-gold-dark" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-brand-ink">Khám phá ngẫu nhiên</div>
          <div className="mt-0.5 text-[13.5px] text-cream-gold-text">Không dựa trên lượt đọc hay điểm số.</div>
          {picked && <div className="mt-3 max-w-[360px]">{picked}</div>}
        </div>
        {button}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3.5 rounded-[20px] border border-cream-gold-border bg-cream-gold p-6">
      <ShuffleIcon size={26} weight="fill" className="text-brand-gold-dark" />
      <div className="text-[22px] font-bold tracking-[-.3px] text-brand-ink">Không biết đọc gì?</div>
      <div className="text-sm leading-relaxed text-cream-gold-text">Vịnh chọn ngẫu nhiên một tác phẩm dự thi hợp lệ cho bạn — không dựa trên lượt đọc.</div>
      {picked}
      <div className="mt-auto">{button}</div>
    </div>
  );
}
