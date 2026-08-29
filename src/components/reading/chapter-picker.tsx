import Link from "next/link";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
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
 * Dropdown chọn chương — theme-aware (style={{background: c.barBg}}) giống
 * panel cỡ chữ/nền có sẵn trong reader.tsx, KHÔNG dùng style tĩnh của
 * auth-cluster.tsx (trang đọc có 3 theme, phải đổi màu theo theme).
 *
 * Định vị bằng "absolute top-full" bên trong wrapper sticky của reader.tsx
 * (không tự "fixed top-[58px]" nữa) để luôn bám sát đáy header thật, không
 * vỡ khi header đổi chiều cao giữa các kích thước màn hình.
 */
export function ChapterPicker({ chapters, currentChapterId, bookSlug, onClose, c }: ChapterPickerProps) {
  return (
    <div
      style={{ background: c.barBg, borderColor: c.hair }}
      className="absolute right-4 top-full z-40 mt-2 max-h-[70vh] w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-[14px] border p-2 shadow-[0_8px_30px_rgba(0,0,0,.18)] sm:right-6"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <div style={{ color: c.inkSoft }} className="text-[13px] font-bold tracking-wide">
          CHỌN CHƯƠNG
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          style={{ color: c.inkSoft }}
          className="-m-2.5 flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-brand-gold-dark"
        >
          <XIcon size={16} />
        </button>
      </div>
      {chapters.map((chapter) => {
        const active = chapter.id === currentChapterId;
        return (
          <Link
            key={chapter.id}
            href={`/read/${bookSlug}/${chapter.id}`}
            onClick={onClose}
            style={active ? { background: c.tintBg, color: c.tintInk } : { color: c.ink }}
            className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium no-underline transition-colors"
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
