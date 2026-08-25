"use client";

import { useState } from "react";
import { BOOK_STATUS_LABEL, type BookStatus } from "@/lib/story/status";
import { ChapterList, type ChapterListRow } from "./chapter-list";
import type { BookGenre } from "@/lib/supabase/types";

type Tab = "tomtat" | "chuong";

type StoryTabsProps = {
  bookSlug: string;
  status: BookStatus;
  /** Nhãn ngày đã format sẵn (vi-VN) — null nếu sách chưa có chương nào. */
  lastUpdatedLabel: string | null;
  genre: BookGenre | null;
  /** Đã sắp theo order_index TĂNG từ cha — component này tự đảo lại để
   * hiện mới→cũ ở tab "Chương" (order_index là tín hiệu thứ tự chương
   * chính thức, nhất quán với 3 nút CTA ở trên). */
  chaptersAscending: ChapterListRow[];
};

const STATUS_DOT: Record<BookStatus, string> = {
  dang_sang_tac: "bg-success",
  tam_ngung: "bg-brand-gold-dark",
  hoan_thanh: "bg-info",
};

export function StoryTabs({ bookSlug, status, lastUpdatedLabel, genre, chaptersAscending }: StoryTabsProps) {
  const [tab, setTab] = useState<Tab>("tomtat");
  const chaptersDescending = [...chaptersAscending].reverse();

  return (
    <div>
      <div className="mb-5 flex gap-6 border-b border-border-light text-[14.5px] font-semibold">
        {(
          [
            ["tomtat", "Tóm tắt"],
            ["chuong", `Chương (${chaptersAscending.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`cursor-pointer border-b-2 pb-3 transition-colors ${
              tab === key ? "border-brand-ink text-brand-ink" : "border-transparent text-stone-alt hover:text-brand-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tomtat" ? (
        <dl className="flex flex-col gap-3 text-[14px]">
          <div className="flex items-center justify-between">
            <dt className="text-stone-alt">Tình trạng</dt>
            <dd className="flex items-center gap-2 font-medium text-brand-ink">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              {BOOK_STATUS_LABEL[status]}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-stone-alt">Cập nhật gần nhất</dt>
            <dd className="font-medium text-brand-ink">{lastUpdatedLabel ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-stone-alt">Thể loại</dt>
            <dd className="font-medium text-brand-ink">{genre ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <ChapterList bookSlug={bookSlug} chapters={chaptersDescending} />
      )}
    </div>
  );
}
