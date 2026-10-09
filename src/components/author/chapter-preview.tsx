"use client";

import { memo, useEffect, useRef } from "react";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/ssr";
import { buildStyledSegments, displayText, parseBlock } from "@/lib/reading/chapter-format";
import { splitParagraphAroundDesignImages } from "@/lib/design/share-link";

/**
 * Cột "Xem trước" của chế độ chia đôi trong chapter-editor.tsx — dựng lại
 * đúng cách reader.tsx hiển thị đoạn văn (chapter-format.ts: tiêu đề, trích
 * dẫn, ngắt cảnh, đậm/nghiêng; font Lora, giãn dòng 2, cách đoạn 1.5em) để
 * tác giả thấy chương như độc giả thấy. Đổi cách hiển thị ở reader.tsx thì
 * sửa cả ở đây. Ảnh thiết kế chỉ hiện ô giữ chỗ — tải ảnh thật cần tra
 * public_design_items, không đáng cho bản xem trước gõ-tới-đâu-hiện-tới-đó.
 */
export const ChapterPreview = memo(function ChapterPreview({
  title,
  content,
  fontSize,
  activeParagraph,
}: {
  title: string;
  content: string;
  fontSize: number;
  /** Đoạn chứa con trỏ trong khung soạn — cuộn bản xem trước theo. */
  activeParagraph: number | null;
}) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const paragraphs = content ? content.split("\n\n") : [];

  useEffect(() => {
    if (activeParagraph === null) return;
    refs.current[activeParagraph]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeParagraph]);

  return (
    <article className="mx-auto w-full max-w-[720px] px-5 py-6 lg:px-7 lg:py-9">
      <h1 className="mb-6 font-[family-name:var(--font-lora)] text-[26px] font-semibold leading-[1.25] text-brand-ink">
        {title || "Chương mới"}
      </h1>
      {!content.trim() && <p className="text-sm text-stone-alt">Nội dung sẽ hiện ở đây khi bạn viết.</p>}
      <div style={{ fontSize: `${fontSize}px`, lineHeight: 2 }} className="font-[family-name:var(--font-lora)] text-ink">
        {paragraphs.map((p, i) => {
          const shell = {
            ref: (el: HTMLDivElement | null) => { refs.current[i] = el; },
            className: `-mx-3 mb-[1.5em] rounded-lg px-3 transition-colors ${i === activeParagraph ? "bg-info/10" : ""}`,
          };
          const parts = splitParagraphAroundDesignImages(p);
          if (parts.some((part) => part.type === "image")) {
            return (
              <div key={i} {...shell}>
                {parts.map((part, pi) =>
                  part.type === "text" ? (
                    part.text ? <p key={pi} className="whitespace-pre-wrap">{displayText(part.text)}</p> : null
                  ) : (
                    <div key={pi} className="my-2 flex items-center justify-center gap-2 rounded-xl border border-dashed border-cream-border bg-surface py-8 text-[13px] text-stone-alt">
                      <ImageSquareIcon size={18} /> Ảnh thiết kế
                    </div>
                  ),
                )}
              </div>
            );
          }
          const block = parseBlock(p);
          if (block.kind === "divider") {
            return (
              <div key={i} {...shell}>
                <p role="separator" className="select-none text-center tracking-[0.6em] text-ink-soft">***</p>
              </div>
            );
          }
          const blockClass =
            block.kind === "heading"
              ? "text-[1.2em] font-semibold text-brand-ink"
              : block.kind === "quote"
                ? "whitespace-pre-wrap border-l-[3px] border-cream-border pl-4 italic"
                : "";
          return (
            <div key={i} {...shell}>
              <p className={blockClass || undefined}>
                {buildStyledSegments(block.text, block.ranges).map((seg, si) =>
                  seg.bold && seg.italic ? <strong key={si}><em>{seg.text}</em></strong>
                    : seg.bold ? <strong key={si}>{seg.text}</strong>
                    : seg.italic ? <em key={si}>{seg.text}</em>
                    : <span key={si}>{seg.text}</span>,
                )}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
});
