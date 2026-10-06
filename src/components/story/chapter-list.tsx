import Link from "next/link";
import { PushPinIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import type { PinnedChapterComment } from "@/lib/reading/pinned-comments";

export type ChapterListRow = {
  id: string;
  title: string;
  createdAt: string;
  voteCount: number;
  /** Bình luận tác giả ghim ở chương này (null nếu chưa ghim). */
  pinnedComment: PinnedChapterComment | null;
};

type ChapterListProps = {
  bookSlug: string;
  chapters: ChapterListRow[];
};

/** Danh sách chương ở tab "Chương" — cha (StoryTabs) đã sắp thứ tự trước
 * khi truyền xuống (mới → cũ). Thuần presentational.
 *
 * Chương có bình luận tác giả ghim: desktop (sm+) hiện thẻ bình luận khi
 * hover/focus dòng chương (CSS thuần, không cần JS); điện thoại không có
 * hover nên hiện 1 dòng trích ngắn ngay dưới tiêu đề. */
export function ChapterList({ bookSlug, chapters }: ChapterListProps) {
  if (chapters.length === 0) {
    return <p className="py-6 text-center text-sm text-stone-alt">Chưa có chương nào.</p>;
  }

  return (
    <ul className="divide-y divide-border-light">
      {chapters.map((chapter) => (
        <li key={chapter.id} className="group relative">
          <Link
            href={`/read/${bookSlug}/${chapter.id}`}
            className="flex items-center justify-between gap-4 py-3.5 text-brand-ink transition-colors hover:text-brand-gold-dark"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-medium">{chapter.title}</span>
                {chapter.pinnedComment && (
                  <PushPinIcon size={13} weight="fill" className="shrink-0 text-brand-gold-dark" aria-label="Có bình luận được ghim" />
                )}
              </span>
              {chapter.pinnedComment && (
                <span className="mt-0.5 block truncate text-[12.5px] text-stone-alt sm:hidden">
                  {chapter.pinnedComment.authorName}: {chapter.pinnedComment.content}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-3.5 text-xs text-stone-alt">
              <span>{new Date(chapter.createdAt).toLocaleDateString("vi-VN")}</span>
              <span className="flex items-center gap-1">
                <StarIcon weight="fill" size={13} /> {chapter.voteCount}
              </span>
            </span>
          </Link>
          {chapter.pinnedComment && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 hidden w-[min(420px,100%)] -translate-y-1 rounded-[12px] border border-border-light bg-surface p-3.5 opacity-0 shadow-[0_12px_32px_rgba(0,0,0,.14)] transition-opacity sm:block sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.3px] text-brand-gold-dark">
                <PushPinIcon size={12} weight="fill" /> Tác giả đã ghim
              </div>
              <div className="text-[13px] font-semibold text-brand-ink">{chapter.pinnedComment.authorName}</div>
              <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-stone-dark">
                {chapter.pinnedComment.content}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
