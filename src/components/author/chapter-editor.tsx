"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  CloudCheckIcon,
  QuotesIcon,
  MinusIcon,
  TextHTwoIcon,
  ImageSquareIcon,
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
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [imageLinkInput, setImageLinkInput] = useState("");
  const [imageLinkPending, setImageLinkPending] = useState(false);
  const [imageLinkError, setImageLinkError] = useState<string | null>(null);

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

  // "Chèn ảnh thiết kế" — validate link chia sẻ (POST /api/design/resolve-link)
  // TRƯỚC khi chèn, rồi chèn marker `[[thiet-ke:<id>]]`, KHÔNG PHẢI url gốc.
  // Lý do bắt buộc: url gốc mang share_token (bí mật) trong query string —
  // chapters.content là text thô, hiện thẳng ra page source cho mọi độc giả
  // (xem reader.tsx) nên không bao giờ được lưu token vào đó. reader.tsx tự
  // resolve lại id → ảnh qua public_design_items (view công khai, không cần
  // token) lúc hiển thị.
  const insertDesignImage = async () => {
    const shareUrl = imageLinkInput.trim();
    if (!shareUrl) {
      setImageLinkError("Vui lòng dán link chia sẻ.");
      return;
    }
    setImageLinkPending(true);
    setImageLinkError(null);
    const res = await fetch("/api/design/resolve-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareUrl }),
    });
    const data = await res.json().catch(() => null);
    setImageLinkPending(false);
    if (!res.ok) {
      setImageLinkError((data && data.error) || "Link không hợp lệ.");
      return;
    }
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    onContentChange(`${content.slice(0, pos)}\n\n[[thiet-ke:${data.designItemId}]]\n\n${content.slice(pos)}`);
    setImageLinkInput("");
    setImagePromptOpen(false);
  };

  // Tự phát hiện link chia sẻ thiết kế dán/gõ THẲNG vào nội dung (không qua
  // nút "Chèn ảnh thiết kế" ở trên) — design-upload-form.tsx mô tả với hoạ
  // sĩ rằng dán link trên 1 dòng riêng là hiển thị được ảnh ngay, nhưng
  // trước đây chỉ có nút bấm mới đổi được sang marker `[[thiet-ke:<id>]]`
  // mà reader.tsx hiểu; dán tay thẳng vào textarea thì y nguyên là chữ link,
  // không hiện ảnh. Quét theo TỪNG DÒNG (đúng "1 dòng riêng"), debounce
  // theo `content` — không hook onPaste vì lúc event đó bắn ra textarea
  // CHƯA có giá trị mới. Cùng lý do bảo mật với insertDesignImage(): thay
  // marker ngay khi phát hiện, KHÔNG bao giờ để share_token (nằm trong url
  // gốc) tồn tại lâu trong content (state cha lẫn payload lưu chương).
  useEffect(() => {
    const lineRe = /^https?:\/\/\S*\/lien-ket-thiet-ke\?\S+$/;
    const lines = content.split("\n");
    const candidateIndexes = lines.reduce<number[]>((acc, line, index) => {
      if (lineRe.test(line.trim())) acc.push(index);
      return acc;
    }, []);
    if (candidateIndexes.length === 0) return;

    const timer = setTimeout(async () => {
      const nextLines = content.split("\n");
      let changed = false;
      for (const index of candidateIndexes) {
        const shareUrl = nextLines[index]?.trim();
        // Nội dung có thể đã đổi giữa lúc debounce và lúc fetch xong (người
        // dùng tự sửa/xoá dòng đó) — bỏ qua nếu không còn khớp.
        if (!shareUrl || !lineRe.test(shareUrl)) continue;
        try {
          const res = await fetch("/api/design/resolve-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareUrl }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.designItemId) {
            nextLines[index] = `[[thiet-ke:${data.designItemId}]]`;
            changed = true;
          }
        } catch {
          // Im lặng — dòng vẫn còn nguyên link, effect tự thử lại lần kế
          // tiếp content đổi (ví dụ người dùng gõ thêm 1 ký tự rồi xoá).
        }
      }
      if (changed) onContentChange(nextLines.join("\n"));
    }, 600);
    return () => clearTimeout(timer);
  }, [content, onContentChange]);

  return (
    <div className="flex flex-col bg-[#FBF8F1] lg:overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-border bg-[#FBF8F1] px-4 py-3.5 lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-stone-alt">
          <span className="truncate">{bookTitle}</span>
          <CaretRightIcon size={12} className="shrink-0" />
          <span className="truncate font-semibold text-brand-ink">{title || "Chương mới"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3.5 text-[13px] font-medium text-stone-alt">
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

      <div className="flex-1 py-6 lg:overflow-y-auto lg:py-9">
        <div className="mx-auto max-w-[660px] px-4 lg:px-7">
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
            <div className="mx-1.5 h-5 w-px bg-cream-border" />
            <button
              type="button"
              onClick={() => {
                setImagePromptOpen((cur) => !cur);
                setImageLinkError(null);
              }}
              title="Chèn ảnh thiết kế"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <ImageSquareIcon size={17} />
            </button>
          </div>

          {imagePromptOpen && (
            <div className="mb-5 rounded-lg border border-cream-border bg-white p-3">
              <div className="flex gap-2">
                <input
                  value={imageLinkInput}
                  onChange={(e) => setImageLinkInput(e.target.value)}
                  placeholder="Dán link chia sẻ thiết kế (…?id=…&token=…)"
                  className="flex-1 rounded-lg border border-cream-border px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-gold"
                />
                <button
                  type="button"
                  onClick={insertDesignImage}
                  disabled={imageLinkPending}
                  className="cursor-pointer rounded-lg bg-brand-gold px-4 text-[13px] font-bold text-brand-ink disabled:opacity-60"
                >
                  {imageLinkPending ? "Đang kiểm tra…" : "Chèn"}
                </button>
              </div>
              {imageLinkError && <div className="mt-2 text-[12px] font-medium text-[#B02A37]">{imageLinkError}</div>}
              <p className="mt-2 text-[11.5px] text-stone-alt">
                Link do hoạ sĩ gửi cho bạn (nút &quot;Tạo link liên kết&quot; ở trang đăng thiết kế) — ảnh sẽ hiện
                đúng tại vị trí con trỏ đang đặt.
              </p>
            </div>
          )}

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
