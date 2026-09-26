import Link from "next/link";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { BookCover } from "@/components/covers/book-cover";
import type { HomepageBook } from "@/lib/home/get-homepage-books";

/**
 * Book card cho bài dự thi — cùng khung với thẻ truyện trang chủ
 * (new-works-grid.tsx), thêm EntryBadge "DỰ THI" và chỗ cho nút bình chọn.
 * Không hiển thị điểm/lượt đọc (thiết kế: "không hiển thị điểm").
 */
export function EntryCard({
  book,
  meta,
  badge = true,
  rank,
  footer,
  compact = false,
}: {
  book: HomepageBook;
  meta?: string | null;
  badge?: boolean;
  /** Hạng BXH (Top truyện) — hiện ở góc bìa. */
  rank?: number | null;
  footer?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <Link href={`/truyen/${book.slug}`} className="group no-underline">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-[0_8px_20px_rgb(20_59_77/.14)] transition-transform duration-200 group-hover:-translate-y-1">
          <BookCover id={book.id} title={book.title} author={book.authorNickname} genre={book.genre} coverUrl={book.coverUrl} className="h-full w-full" />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {rank != null && (
              <span className="rounded-full bg-brand-ink px-2 py-0.5 text-[11px] font-extrabold text-brand-gold-light">#{rank}</span>
            )}
            {badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold-light px-2 py-0.5 text-[10px] font-bold tracking-[.5px] text-brand-ink">
                <TrophyIcon size={10} weight="fill" /> DỰ THI
              </span>
            )}
          </div>
        </div>
        <div className={`${compact ? "mt-2" : "mt-2.5"} line-clamp-2 text-[14.5px] font-semibold text-ink`}>{book.title}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-stone-light">
          {book.authorNickname ?? "Ẩn danh"}
          {meta ? ` · ${meta}` : book.genre ? ` · ${book.genre}` : ""}
        </div>
      </Link>
      {footer}
    </div>
  );
}
