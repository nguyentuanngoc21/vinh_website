import Link from "next/link";
import { ArrowClockwiseIcon, ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react/dist/ssr";

type StoryCtaButtonsProps = {
  bookSlug: string;
  /** Chương published có order_index nhỏ nhất — null nếu sách chưa có
   * chương published nào (edge case: books.published=true nhưng 0 chương). */
  firstChapterId: string | null;
  /** Chương published có order_index lớn nhất. */
  lastChapterId: string | null;
  /** Chương gần nhất user này đã đọc (từ book_progress) — null nếu chưa
   * đăng nhập hoặc chưa từng đọc sách này. */
  continueChapterId: string | null;
};

/**
 * 3 nút hành động trên trang giới thiệu truyện. Presentational thuần (chỉ
 * <Link>, không state) — Server Component cha tự tính sẵn 3 id rồi truyền
 * xuống. Ẩn từng nút khi id tương ứng là null, thay vì render link cụt.
 */
export function StoryCtaButtons({ bookSlug, firstChapterId, lastChapterId, continueChapterId }: StoryCtaButtonsProps) {
  if (!firstChapterId || !lastChapterId) {
    return (
      <div className="rounded-[10px] border border-border-light bg-neutral-bg px-4 py-3.5 text-center text-sm text-stone-alt">
        Truyện chưa có chương nào được đăng.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
      {continueChapterId && (
        <Link
          href={`/read/${bookSlug}/${continueChapterId}`}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand-gold py-3 text-[15px] font-bold text-brand-ink transition-transform active:scale-[.99] sm:flex-1 sm:py-[13px]"
        >
          <ArrowClockwiseIcon weight="bold" /> Tiếp tục đọc
        </Link>
      )}
      <Link
        href={`/read/${bookSlug}/${firstChapterId}`}
        className={`flex w-full items-center justify-center gap-2 rounded-[10px] border border-border-light py-3 text-[15px] font-bold text-brand-ink transition-transform active:scale-[.99] sm:flex-1 sm:py-[13px] ${
          continueChapterId ? "" : "bg-brand-gold border-transparent"
        }`}
      >
        <BookOpenIcon weight="bold" /> Đọc từ đầu
      </Link>
      <Link
        href={`/read/${bookSlug}/${lastChapterId}`}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand-ink py-3 text-[15px] font-bold text-white transition-transform active:scale-[.99] sm:flex-1 sm:py-[13px]"
      >
        Đọc mới nhất <ArrowRightIcon weight="bold" />
      </Link>
    </div>
  );
}
