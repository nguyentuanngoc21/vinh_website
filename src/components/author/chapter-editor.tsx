"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  CloudCheckIcon,
  QuotesIcon,
  MinusIcon,
  TextHTwoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Checkbox, Field } from "@/components/ui";

type ChapterEditorProps = {
  bookTitle: string;
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  savedAt: Date | null;
  isLastChapter: boolean;
  onIsLastChapterToggle: () => void;
  /** true nếu chương này đã từng lưu is_last_chapter=true — checkbox
   * khoá lại vĩnh viễn từ đây (không unlock được, khớp trigger DB
   * prevent_unset_last_chapter). */
  isLastChapterLocked: boolean;
  bookSlug: string;
  /** true = sách đã có ít nhất 1 chương từng xuất bản — /truyen/[slug]
   * chỉ tồn tại từ lúc đó, nên link "Xem trang truyện" chỉ hiện khi true. */
  bookPublished: boolean;
};

/**
 * Toolbar B/I/H2/quote/gạch ngang giờ thao tác THẬT trên đoạn đang chọn
 * trong textarea (bọc/chèn markdown) — trước đây toàn bộ là <div> không
 * onClick. Bỏ 2 nút cũ: "align-left" (không có khái niệm căn lề với
 * content lưu dạng text thuần) và ảnh (cần bucket/route upload riêng,
 * việc khác ngoài phạm vi sửa lần này) — giữ nút giả vờ hoạt động còn tệ
 * hơn không có nút.
 */
export function ChapterEditor({
  bookTitle,
  title,
  onTitleChange,
  content,
  onContentChange,
  savedAt,
  isLastChapter,
  onIsLastChapterToggle,
  isLastChapterLocked,
  bookSlug,
  bookPublished,
}: ChapterEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const words = (content.trim().match(/\S+/g) ?? []).length;
  const wordCount = words.toLocaleString("vi-VN");
  const readMin = Math.max(1, Math.round(words / 200));

  const wrapSelection = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const selected = content.slice(selectionStart, selectionEnd);
    const next =
      content.slice(0, selectionStart) + marker + selected + marker + content.slice(selectionEnd);
    onContentChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length);
    });
  };

  const prefixCurrentLine = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    onContentChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + prefix.length, selectionEnd + prefix.length);
    });
  };

  const insertDivider = () => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    onContentChange(`${content.slice(0, pos)}\n\n---\n\n${content.slice(pos)}`);
  };

  return (
    <div className="flex flex-col overflow-hidden bg-[#FBF8F1]">
      <div className="flex items-center justify-between border-b border-cream-border bg-[#FBF8F1] px-7 py-3.5">
        <div className="flex items-center gap-2.5 text-[13px] font-medium text-stone-alt">
          <span>{bookTitle}</span>
          <CaretRightIcon size={12} />
          <span className="font-semibold text-brand-ink">{title || "Chương mới"}</span>
        </div>
        <div className="flex items-center gap-3.5 text-[13px] font-medium text-stone-alt">
          {bookPublished && (
            <Link
              href={`/truyen/${bookSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-gold-dark no-underline transition-colors hover:text-brand-ink"
            >
              Xem trang truyện <ArrowSquareOutIcon size={13} />
            </Link>
          )}
          {savedAt && (
            <span className="flex items-center gap-1">
              <CloudCheckIcon color="#3B9B6F" /> Đã lưu ·{" "}
              {savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-9">
        <div className="mx-auto max-w-[660px] px-7">
          <Field
            label={null}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Tên chương"
            className="mb-1.5 w-full resize-none border-none bg-transparent p-0 font-[family-name:var(--font-lora)] text-[32px] font-semibold text-brand-ink outline-none"
          />
          <div className="mb-[22px] flex items-center gap-3.5 text-[13px] text-stone-alt">
            <span>{wordCount} chữ</span>
            <span>·</span>
            <span>~{readMin} phút đọc</span>
          </div>

          <div className={`mb-[22px] ${isLastChapterLocked ? "opacity-60" : ""}`}>
            <Checkbox checked={isLastChapter} onChange={isLastChapterLocked ? () => {} : onIsLastChapterToggle}>
              Đây là chương cuối cùng của truyện
              {isLastChapterLocked && <span className="ml-1 text-stone-alt">(không thể bỏ chọn sau khi lưu)</span>}
            </Checkbox>
          </div>

          <div className="sticky top-0 z-[5] mb-5 flex items-center gap-1 border-b border-cream-border bg-[#FBF8F1] py-2">
            <button
              type="button"
              onClick={() => wrapSelection("**")}
              title="Đậm"
              className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-bold transition-colors hover:bg-info-bg"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => wrapSelection("*")}
              title="Nghiêng"
              className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-medium italic transition-colors hover:bg-info-bg"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => prefixCurrentLine("## ")}
              title="Tiêu đề nhỏ"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <TextHTwoIcon size={17} />
            </button>
            <div className="mx-1.5 h-5 w-px bg-cream-border" />
            <button
              type="button"
              onClick={() => prefixCurrentLine("> ")}
              title="Trích dẫn"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <QuotesIcon size={17} />
            </button>
            <button
              type="button"
              onClick={insertDivider}
              title="Chèn gạch ngang"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <MinusIcon size={17} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="min-h-[460px] w-full resize-none border-none bg-transparent font-[family-name:var(--font-lora)] text-lg leading-[1.95] text-[#2b2925] outline-none"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Bắt đầu viết…"
          />
        </div>
      </div>
    </div>
  );
}
