import Link from "next/link";
import { StarIcon } from "@phosphor-icons/react/dist/ssr";

export type ChapterListRow = {
  id: string;
  title: string;
  createdAt: string;
  voteCount: number;
};

type ChapterListProps = {
  bookSlug: string;
  chapters: ChapterListRow[];
};

/** Danh sách chương ở tab "Chương" — cha (StoryTabs) đã sắp thứ tự trước
 * khi truyền xuống (mới → cũ). Thuần presentational. */
export function ChapterList({ bookSlug, chapters }: ChapterListProps) {
  if (chapters.length === 0) {
    return <p className="py-6 text-center text-sm text-stone-alt">Chưa có chương nào.</p>;
  }

  return (
    <ul className="divide-y divide-border-light">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <Link
            href={`/read/${bookSlug}/${chapter.id}`}
            className="flex items-center justify-between gap-4 py-3.5 text-brand-ink transition-colors hover:text-brand-gold-dark"
          >
            <span className="truncate text-[14.5px] font-medium">{chapter.title}</span>
            <span className="flex shrink-0 items-center gap-3.5 text-xs text-stone-alt">
              <span>{new Date(chapter.createdAt).toLocaleDateString("vi-VN")}</span>
              <span className="flex items-center gap-1">
                <StarIcon weight="fill" size={13} /> {chapter.voteCount}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
