import Link from "next/link";
import type { ThemeColors } from "./reader";

export type ReaderChapterSummary = { id: string; title: string; position: number };

type ChapterPickerProps = {
  chapters: ReaderChapterSummary[];
  currentChapterId?: string;
  bookSlug: string;
  onClose: () => void;
  c: ThemeColors;
};

/**
 * Dropdown chọn chương — theme-aware (fixed + style={{background: c.barBg}})
 * giống panel cỡ chữ/nền có sẵn trong reader.tsx, KHÔNG dùng style tĩnh
 * của auth-cluster.tsx (trang đọc có 3 theme, phải đổi màu theo theme).
 */
export function ChapterPicker({ chapters, currentChapterId, bookSlug, onClose, c }: ChapterPickerProps) {
  return (
    <div
      style={{ background: c.barBg, borderColor: c.hair }}
      className="fixed right-[104px] top-[58px] z-40 max-h-[70vh] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-[14px] border p-2 shadow-[0_8px_30px_rgba(0,0,0,.18)]"
    >
      {chapters.map((chapter) => {
        const active = chapter.id === currentChapterId;
        return (
          <Link
            key={chapter.id}
            href={`/read/${bookSlug}/${chapter.id}`}
            onClick={onClose}
            style={active ? { background: c.tintBg, color: c.tintInk } : { color: c.ink }}
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium no-underline transition-colors"
          >
            <span style={{ color: c.inkSoft }} className="shrink-0 text-xs">
              {chapter.position}
            </span>
            <span className="truncate">{chapter.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
