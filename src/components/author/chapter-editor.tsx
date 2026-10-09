"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CaretRightIcon,
  CloudCheckIcon,
  CloudArrowUpIcon,
  WarningCircleIcon,
  QuotesIcon,
  MinusIcon,
  TextHTwoIcon,
  ImageSquareIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, Checkbox, Field } from "@/components/ui";
import { isDesignShareLinkShape } from "@/lib/design/share-link";
import type { ChangeKind, HistoryEntry, Selection } from "@/lib/authoring/text-history";

export type SaveStatus = { tone: "ok" | "busy" | "warn" | "error"; label: string };
const HEADING_PREFIX = /^#{1,3}\s+/;
const QUOTE_PREFIX = /^>\s?/;

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
  /** selection = vị trí con trỏ SAU thay đổi (để undo/redo đặt lại);
   * kind "type" = gõ phím (gộp thành 1 bước undo), "edit" = thao tác khác. */
  onContentChange: (content: string, selection?: Selection, kind?: ChangeKind) => void;
  onUndo: () => HistoryEntry | null;
  onRedo: () => HistoryEntry | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Ctrl/Cmd+S. */
  onSaveShortcut?: () => void;
  saveStatus: SaveStatus | null;
  /** Thông báo phục hồi nháp / xung đột phiên bản, hiện ngay dưới thanh trên cùng. */
  notice?: ReactNode;
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
 * Toolbar B/I/H2/quote/ngắt cảnh ghi ký hiệu vào content (text thuần);
 * trang đọc hiển thị đúng định dạng qua src/lib/reading/chapter-format.ts —
 * thêm ký hiệu mới thì sửa CẢ hai nơi. Tiêu đề/trích dẫn áp cho cả ĐOẠN
 * (khối tách bằng dòng trống) vì trang đọc xét định dạng theo đoạn.
 *
 * Undo/redo do trình soạn thảo tự giữ (use-text-history.ts): textarea bị
 * React điều khiển và toolbar ghi đè value nên undo gốc của trình duyệt
 * không dùng được — Ctrl/Cmd+Z, Ctrl+Shift+Z/Ctrl+Y và lệnh undo của hệ
 * điều hành (beforeinput historyUndo) đều đi qua lịch sử riêng.
 */
export function ChapterEditor({
  bookTitle,
  title,
  onTitleChange,
  content,
  onContentChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveShortcut,
  saveStatus,
  notice,
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

  // Ô nội dung giãn theo độ dài chương (không cuộn bên trong 1 khung cố
  // định) — tối thiểu bằng phần còn trống của cột (textarea flex-1, cột
  // editor cao bằng sidebar PublishPanel nhờ grid stretch), dài hơn thì
  // đẩy cả cột/trang dài ra. minHeight (không phải height) vì height bị
  // flex-1 bỏ qua. Reset về "" (min-h-[460px] gốc) trước khi đo để co lại
  // được khi xoá bớt chữ; giữ nguyên vị trí cuộn vì lúc reset trang co tạm
  // thời, trình duyệt có thể kéo scroll lên.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      const scroller = el.closest<HTMLElement>("[data-editor-scroll]");
      const scrollerTop = scroller?.scrollTop ?? 0;
      const windowY = window.scrollY;
      el.style.minHeight = "";
      el.style.minHeight = `${el.scrollHeight}px`;
      if (scroller) scroller.scrollTop = scrollerTop;
      window.scrollTo({ top: windowY });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [content]);

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
    const selection = { start: selectionStart + marker.length, end: selectionStart + marker.length + selected.length };
    onContentChange(next, selection, "edit");
    placeCursor(selection);
  };

  const placeCursor = (selection: Selection) => {
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selection.start, selection.end);
    });
  };

  // Bật/tắt tiêu đề hoặc trích dẫn cho cả đoạn chứa con trỏ.
  const toggleBlock = (kind: "heading" | "quote") => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const { start, end } = findParagraphRange(content, selectionStart);
    const block = content.slice(start, end);
    let nextBlock: string;
    if (kind === "heading") {
      nextBlock = HEADING_PREFIX.test(block) ? block.replace(HEADING_PREFIX, "") : `## ${block.replace(/\n+/g, " ")}`;
    } else {
      const lines = block.split("\n");
      const quoted = block.trim() !== "" && lines.filter((l) => l.trim()).every((l) => QUOTE_PREFIX.test(l));
      nextBlock = lines.map((l) => (quoted ? l.replace(QUOTE_PREFIX, "") : `> ${l}`)).join("\n");
    }
    const delta = nextBlock.length - block.length;
    const shift = (pos: number) => Math.max(start, Math.min(start + nextBlock.length, pos + delta));
    const selection = { start: shift(selectionStart), end: shift(selectionEnd) };
    onContentChange(content.slice(0, start) + nextBlock + content.slice(end), selection, "edit");
    placeCursor(selection);
  };

  const insertDivider = () => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    const selection = { start: pos + 7, end: pos + 7 };
    onContentChange(`${content.slice(0, pos)}\n\n***\n\n${content.slice(pos)}`, selection, "edit");
    placeCursor(selection);
  };

  const applyHistory = (entry: HistoryEntry | null) => {
    if (entry) placeCursor(entry.selection);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      applyHistory(onUndo());
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      applyHistory(onRedo());
    } else if (key === "b") {
      e.preventDefault();
      wrapSelection("**");
    } else if (key === "i") {
      e.preventDefault();
      wrapSelection("*");
    } else if (key === "s") {
      e.preventDefault();
      onSaveShortcut?.();
    }
  };

  // Lệnh "Hoàn tác" của menu trình duyệt / bàn phím ảo không đi qua keydown.
  const historyHandlers = useRef({ onUndo, onRedo });
  useEffect(() => {
    historyHandlers.current = { onUndo, onRedo };
  });
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") return;
      e.preventDefault();
      const entry = e.inputType === "historyUndo" ? historyHandlers.current.onUndo() : historyHandlers.current.onRedo();
      if (entry) requestAnimationFrame(() => el.setSelectionRange(entry.selection.start, entry.selection.end));
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

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
    const inserted = `\n\n[[thiet-ke:${data.designItemId}]]\n\n`;
    const after = pos + inserted.length;
    onContentChange(`${content.slice(0, pos)}${inserted}${content.slice(pos)}`, { start: after, end: after }, "edit");
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
      if (changed) onContentChange(nextParagraphs.join("\n\n"), undefined, "edit");
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
          const newPos = paragraphStart + marker.length + 2;
          onContentChange(next, { start: newPos, end: newPos }, "edit");
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        } else {
          const next = content.slice(0, selectionStart) + pasted + content.slice(selectionEnd);
          const newPos = selectionStart + pasted.length;
          onContentChange(next, { start: newPos, end: newPos }, "edit");
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          });
        }
      });
  };

  return (
    <div className="flex flex-col bg-surface-warm lg:overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-border bg-surface-warm px-4 py-3.5 lg:px-7">
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
          {saveStatus && (
            <span
              role="status"
              className={`flex items-center gap-1 ${saveStatus.tone === "error" ? "text-error" : saveStatus.tone === "warn" ? "text-brand-gold-dark" : ""}`}
            >
              {saveStatus.tone === "ok" ? (
                <CloudCheckIcon className="text-success-text" />
              ) : saveStatus.tone === "busy" ? (
                <CloudArrowUpIcon />
              ) : (
                <WarningCircleIcon />
              )}
              {saveStatus.label}
            </span>
          )}
        </div>
      </div>
      {notice}

      <div data-editor-scroll className="flex flex-1 flex-col py-6 lg:overflow-y-auto lg:py-9">
        <div className="mx-auto flex w-full max-w-[660px] flex-1 flex-col px-4 lg:px-7">
          <Field
            label={null}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Tên chương"
            // className ghép qua cn() (tailwind-merge) nên p-0/text-[32px] đè được padding/cỡ chữ gốc của Field
            className="mb-1.5 border-none bg-transparent p-0 font-[family-name:var(--font-lora)] text-[32px] font-semibold text-brand-ink outline-none"
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

          <div className="sticky top-0 z-[5] mb-5 flex items-center gap-1 overflow-x-auto border-b border-cream-border bg-surface-warm py-2">
            <button
              type="button"
              onClick={() => applyHistory(onUndo())}
              disabled={!canUndo}
              title="Hoàn tác (Ctrl+Z)"
              aria-label="Hoàn tác"
              className="min-h-10 shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ArrowUUpLeftIcon size={17} />
            </button>
            <button
              type="button"
              onClick={() => applyHistory(onRedo())}
              disabled={!canRedo}
              title="Làm lại (Ctrl+Shift+Z)"
              aria-label="Làm lại"
              className="min-h-10 shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ArrowUUpRightIcon size={17} />
            </button>
            <div className="mx-1.5 h-5 w-px shrink-0 bg-cream-border" />
            <button
              type="button"
              onClick={() => wrapSelection("**")}
              title="Đậm (Ctrl+B)"
              className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-bold transition-colors hover:bg-info-bg"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => wrapSelection("*")}
              title="Nghiêng (Ctrl+I)"
              className="cursor-pointer rounded-md px-2.5 py-1.5 font-[family-name:var(--font-lora)] text-[15px] font-medium italic transition-colors hover:bg-info-bg"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => toggleBlock("heading")}
              title="Tiêu đề nhỏ (cả đoạn)"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <TextHTwoIcon size={17} />
            </button>
            <div className="mx-1.5 h-5 w-px shrink-0 bg-cream-border" />
            <button
              type="button"
              onClick={() => toggleBlock("quote")}
              title="Trích dẫn (cả đoạn)"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <QuotesIcon size={17} />
            </button>
            <button
              type="button"
              onClick={insertDivider}
              title="Chèn ngắt cảnh (***)"
              className="cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-info-bg"
            >
              <MinusIcon size={17} />
            </button>
            <div className="mx-1.5 h-5 w-px shrink-0 bg-cream-border" />
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
            <div className="mb-5 rounded-lg border border-cream-border bg-surface p-3">
              <div className="flex gap-2">
                {/* Ô nhập gọn — size="sm" của kit */}
                <Field
                  label={null}
                  wrapperClassName="min-w-0 flex-1"
                  value={imageLinkInput}
                  onChange={(e) => setImageLinkInput(e.target.value)}
                  placeholder="Dán link chia sẻ thiết kế (…?id=…&token=…)"
                  size="sm"
                />
                <Button
                  type="button"
                  onClick={insertDesignImage}
                  disabled={imageLinkPending}
                  fullWidth={false}
                  className="shrink-0 px-4 py-0 text-[13px]"
                >
                  {imageLinkPending ? "Đang kiểm tra…" : "Chèn"}
                </Button>
              </div>
              {imageLinkError && <div className="mt-2 text-[12px] font-medium text-error">{imageLinkError}</div>}
              <p className="mt-2 text-[11.5px] text-stone-alt">
                Link do hoạ sĩ gửi cho bạn (nút &quot;Tạo link liên kết&quot; ở trang đăng thiết kế) — ảnh sẽ hiện
                đúng tại vị trí con trỏ đang đặt.
              </p>
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="min-h-[460px] w-full flex-1 resize-none overflow-hidden border-none bg-transparent font-[family-name:var(--font-lora)] text-lg leading-[1.95] text-[#2b2925] dark:text-ink outline-none"
            value={content}
            onChange={(e) => {
              // Dán / cắt / kéo-thả là 1 bước undo riêng, không gộp với chữ đang gõ.
              const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
              const kind = /^(insertFromPaste|insertFromDrop|deleteByCut|deleteByDrag)/.test(inputType) ? "edit" : "type";
              onContentChange(e.target.value, { start: e.target.selectionStart, end: e.target.selectionEnd }, kind);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handleContentPaste}
            placeholder="Bắt đầu viết…"
          />
        </div>
      </div>
    </div>
  );
}
