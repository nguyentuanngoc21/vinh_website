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
import { isDesignShareLinkShape } from "@/lib/design/share-link";

/**
 * Tìm [start, end) của đúng 1 "block/đoạn" (đơn vị `\n\n`-split, khớp
 * reader.tsx) chứa vị trí `pos` trong `content` — dùng ở handleContentPaste
 * bên dưới để biết có đang dán vào 1 đoạn TRỐNG không. indexOf/lastIndexOf("\n\n", ...)
 * trực tiếp trên chuỗi thô KHÔNG dùng được ở đây: 1 đoạn trống nằm GIỮA 2
 * đoạn khác tạo ra 4 dấu \n liên tiếp ("A" + "\n\n" + "" + "\n\n" + "B"),
 * mà "\n\n" khớp CHỒNG LẤP ở nhiều vị trí trong 1 dãy \n dài (cả vị trí La
 * và La+1 đều khớp "\n\n" trong dãy 4 dấu \n đó), khiến lastIndexOf/indexOf
 * lệch mất 1 ký tự. split("\n\n") không có nhập nhằng này — chỉ khớp
 * không-chồng-lấp, trái sang phải — nên dùng nó làm nguồn sự thật duy nhất,
 * đứng module-scope vì hàm thuần, không đụng gì tới state/props.
 */
function findParagraphRange(content: string, pos: number): { start: number; end: number } {
  const paragraphs = content.split("\n\n");
  let offset = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const start = offset;
    const end = start + paragraphs[i].length;
    if (pos <= end || i === paragraphs.length - 1) return { start, end };
    offset = end + 2;
  }
  return { start: 0, end: 0 };
}

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

  // Tự "chữa" link chia sẻ thiết kế còn nằm thô trong content ĐÃ LƯU từ
  // trước (ví dụ dán bằng cách không bắn event `paste` — kéo-thả, hoặc
  // trước khi handleContentPaste dưới đây tồn tại) — quét theo BLOCK
  // (`\n\n`, khớp đúng đơn vị "đoạn/paragraph" mà reader.tsx dùng để nhận
  // ảnh, xem src/lib/design/share-link.ts), KHÔNG theo dòng đơn: link nằm
  // giữa các dòng thơ ngăn bằng 1 lần Enter (cùng block với chữ khác)
  // KHÔNG được tự chuyển — đúng quy tắc "URL nằm riêng trong 1 block,
  // không lẫn text khác". Đường paste chính giờ là handleContentPaste
  // (chạy NGAY lúc dán, không đợi debounce) — effect này chỉ còn là lưới
  // an toàn.
  useEffect(() => {
    const paragraphs = content.split("\n\n");
    const candidateIndexes = paragraphs.reduce<number[]>((acc, paragraph, index) => {
      if (isDesignShareLinkShape(paragraph.trim())) acc.push(index);
      return acc;
    }, []);
    if (candidateIndexes.length === 0) return;

    const timer = setTimeout(async () => {
      const nextParagraphs = content.split("\n\n");
      let changed = false;
      for (const index of candidateIndexes) {
        const shareUrl = nextParagraphs[index]?.trim();
        // Nội dung có thể đã đổi giữa lúc debounce và lúc fetch xong (người
        // dùng tự sửa/xoá block đó) — bỏ qua nếu không còn khớp.
        if (!shareUrl || !isDesignShareLinkShape(shareUrl)) continue;
        try {
          const res = await fetch("/api/design/resolve-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareUrl }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.designItemId) {
            nextParagraphs[index] = `[[thiet-ke:${data.designItemId}]]`;
            changed = true;
          }
        } catch {
          // Im lặng — block vẫn còn nguyên link, effect tự thử lại lần kế
          // tiếp content đổi (ví dụ người dùng gõ thêm 1 ký tự rồi xoá).
        }
      }
      if (changed) onContentChange(nextParagraphs.join("\n\n"));
    }, 600);
    return () => clearTimeout(timer);
  }, [content, onContentChange]);

  // Đường paste CHÍNH — pipeline: lấy plain text đã dán → trim → có phải
  // NGUYÊN VẸN 1 link thiết kế (id+token) không → cursor đang ở 1
  // block/đoạn TRỐNG không (không lẫn chữ khác, không có vùng đang chọn)
  // → validate qua resolve-link (không tự fetch URL ngoài — tránh SSRF,
  // chỉ tra DB nội bộ) → thành công: preventDefault(), thay block đó bằng
  // marker + chèn 1 đoạn trống ngay sau để viết tiếp; thất bại: vẫn chèn
  // NGUYÊN VĂN đã dán (đúng hành vi paste bình thường mà preventDefault
  // vừa chặn), không mất nội dung. Không thoả bất kỳ điều kiện nào ở trên
  // (dán kèm chữ khác, hoặc block không trống) → return sớm, KHÔNG
  // preventDefault, để trình duyệt tự dán chữ như mọi lần paste khác.
  const handleContentPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const pasted = e.clipboardData.getData("text/plain");
    const trimmed = pasted.trim();
    if (!trimmed || !isDesignShareLinkShape(trimmed)) return;

    const { selectionStart, selectionEnd } = el;
    if (selectionStart !== selectionEnd) return; // đang có vùng chọn — không tính là block trống

    const { start: paragraphStart, end: paragraphEnd } = findParagraphRange(content, selectionStart);
    if (content.slice(paragraphStart, paragraphEnd).trim() !== "") return; // block đang dán vào không trống

    e.preventDefault();
    fetch("/api/design/resolve-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareUrl: trimmed }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
      .catch(() => ({ ok: false, data: null }))
      .then(({ ok, data }) => {
        if (ok && data?.designItemId) {
          const marker = `[[thiet-ke:${data.designItemId}]]`;
          const next = content.slice(0, paragraphStart) + marker + "\n\n" + content.slice(paragraphEnd);
          onContentChange(next);
          const newPos = paragraphStart + marker.length + 2;
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        } else {
          const next = content.slice(0, selectionStart) + pasted + content.slice(selectionEnd);
          onContentChange(next);
          const newPos = selectionStart + pasted.length;
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        }
      });
  };

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
            onPaste={handleContentPaste}
            placeholder="Bắt đầu viết…"
          />
        </div>
      </div>
    </div>
  );
}
