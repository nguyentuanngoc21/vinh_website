"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { EntryCard } from "@/components/contests/entry-card";
import { VoteButton } from "@/components/contests/vote-button";
import type { EntryCard as EntryCardData, EntrySort } from "@/lib/contests/feeds";

const SORTS: { key: EntrySort; label: string }[] = [
  { key: "discover", label: "Ngẫu nhiên" },
  { key: "new", label: "Mới nhất" },
  { key: "az", label: "A–Z" },
];

/**
 * Tab "Bài dự thi" / "Tác phẩm": lọc thể loại + sắp xếp (mặc định Ngẫu
 * nhiên — tránh thứ tự theo độ nổi tiếng), bình chọn ngay trên thẻ khi
 * đang bình chọn. Bộ lọc là query string (?sort=&genre=) để chia sẻ link được;
 * "Xem thêm" tải trang tiếp qua API bằng cursor.
 */
export function EntryGrid({
  slug,
  baseHref,
  sort,
  genre,
  genres,
  initial,
  showVote,
}: {
  slug: string;
  baseHref: string;
  sort: EntrySort;
  genre: string | null;
  genres: string[];
  initial: { items: EntryCardData[]; next_cursor: string | null };
  showVote: boolean;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = (next: { sort?: EntrySort; genre?: string | null }) => {
    const qs = new URLSearchParams(baseHref.split("?")[1] ?? "");
    qs.set("sort", next.sort ?? sort);
    const g = next.genre === undefined ? genre : next.genre;
    if (g) qs.set("genre", g);
    else qs.delete("genre");
    return `${baseHref.split("?")[0]}?${qs}`;
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ sort, cursor });
    if (genre) qs.set("genre", genre);
    const res = await fetch(`/api/contests/${slug}/submissions?${qs}`);
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được · Thử lại");
      return;
    }
    setItems((prev) => [...prev, ...data.items]);
    setCursor(data.next_cursor);
  };

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] no-underline ${
      active ? "bg-cream-gold font-semibold text-brand-gold-dark" : "bg-neutral-bg font-medium text-ink"
    }`;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link href={href({ genre: null })} scroll={false} className={chip(!genre)}>Tất cả</Link>
          {genres.map((g) => (
            <Link key={g} href={href({ genre: g })} scroll={false} className={chip(genre === g)}>{g}</Link>
          ))}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-[13px] text-stone-alt">Sắp xếp</span>
          {SORTS.map((s) => (
            <Link key={s.key} href={href({ sort: s.key })} scroll={false}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] no-underline ${
                s.key === sort ? "border-brand-ink font-semibold text-brand-ink" : "border-border-light font-medium text-stone-dark"
              }`}>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light p-10 text-center text-sm text-stone-alt">
          {genre ? (
            <>Không có tác phẩm nào thuộc thể loại này. <Link href={href({ genre: null })} className="font-semibold text-brand-gold-dark">Xem tất cả</Link></>
          ) : (
            "Chưa có tác phẩm dự thi."
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((e) => (
            <EntryCard key={e.submission_id} book={e.book} badge={false}
              footer={showVote && e.vote ? <VoteButton slug={slug} submissionId={e.submission_id} initial={e.vote} /> : null} />
          ))}
        </div>
      )}

      {(cursor || error) && (
        <div className="mt-7 flex justify-center">
          <Button type="button" variant="ghost" fullWidth={false} className="px-6 py-2.5 text-sm" disabled={loading} onClick={loadMore}>
            {loading ? "Đang tải…" : (error ?? "Xem thêm")}
          </Button>
        </div>
      )}
    </div>
  );
}
