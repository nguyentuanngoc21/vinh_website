"use client";

import { useEffect, useState } from "react";
import { XIcon, TrashIcon, ChatCircleIcon, PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";
import { relativeTimeLabel } from "@/lib/format-time";
import {
  PARAGRAPH_COMMENTS_PANEL_WIDTH,
  type ParagraphComment,
  type ParagraphCommentThread,
} from "@/lib/reading/paragraph-comments";

type ParagraphCommentsPanelProps = {
  chapterId: string;
  paragraphIndex: number;
  threads: ParagraphCommentThread[];
  onClose: () => void;
  /** paragraphIndex cố định (bình luận gốc) — reader.tsx tự thêm bình
   * luận mới vào state chung sau khi API trả về, không phải panel tự giữ
   * state riêng, để huy hiệu số đếm ở reader.tsx luôn khớp ngay. */
  onCommentCreated: (comment: ParagraphComment) => void;
  onCommentDeleted: (commentId: string) => void;
};

/**
 * "Chú thích đoạn văn" — mở từ nút "Bình luận"/huy hiệu số ở mỗi đoạn
 * (reader.tsx). Desktop (lg+): cột cố định bên phải, trang truyện dồn sang
 * trái (không che nội dung đang đọc). Điện thoại: lớp phủ từ dưới lên
 * (bottom sheet) có nền mờ, chạm nền để đóng.
 *
 * Reply lồng CHỈ 1 CẤP: mỗi thread là 1 bình luận gốc + danh sách reply,
 * KHÔNG có nút "Trả lời" trên chính 1 reply (API cũng chặn ở server, xem
 * api/chapters/[chapterId]/comments/route.ts). Reply thu gọn mặc định sau
 * nút "Xem N lời trả lời".
 */
export function ParagraphCommentsPanel({
  chapterId,
  paragraphIndex,
  threads,
  onClose,
  onCommentCreated,
  onCommentDeleted,
}: ParagraphCommentsPanelProps) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 1 mốc "bây giờ" cho cả danh sách, lấy lúc mở panel (không gọi Date.now()
  // khi render — react-hooks/purity).
  const [now] = useState(() => Date.now());

  const total = threads.reduce((sum, t) => sum + 1 + t.replies.length, 0);

  // Esc để đóng — cột bên desktop không có nền mờ để bấm ra ngoài.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const post = async (content: string, parentCommentId: string | null) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, paragraphIndex, parentCommentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.comment) {
        setError((data && typeof data.error === "string" && data.error) || "Gửi bình luận thất bại.");
        return;
      }
      onCommentCreated(data.comment);
      if (parentCommentId) {
        setReplyTo(null);
        setReplyDraft("");
        // Mở luôn nhánh reply vừa trả lời để thấy bình luận mình vừa gửi.
        setExpanded((prev) => new Set(prev).add(parentCommentId));
      } else {
        setDraft("");
      }
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    if (pendingDeleteId) return;
    setPendingDeleteId(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/comments/${commentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Xoá bình luận thất bại.");
        return;
      }
      onCommentDeleted(commentId);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingDeleteId(null);
    }
  };

  const renderOne = (c: ParagraphComment, isReply: boolean) => (
    <div key={c.id} className={isReply ? "mt-3" : ""}>
      <div className="flex items-start gap-3">
        {c.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.authorAvatarUrl}
            alt={c.authorName}
            className={`${isReply ? "size-7" : "size-9"} shrink-0 rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${isReply ? "size-7" : "size-9"} flex shrink-0 items-center justify-center rounded-full bg-brand-gold-dark text-xs font-bold text-white`}
          >
            {c.authorName[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-ink">{c.authorName}</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.55] text-slate">{c.content}</p>
          <div className="mt-2 flex items-center gap-4 text-stone-alt">
            <span className="text-[12px]">{relativeTimeLabel(c.createdAt, now)}</span>
            <div className="ml-auto flex items-center gap-1">
              {!isReply && (
                <button
                  type="button"
                  onClick={() => setReplyTo({ id: c.id, authorName: c.authorName })}
                  aria-label={`Trả lời ${c.authorName}`}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-neutral-bg hover:text-brand-ink"
                >
                  <ChatCircleIcon size={18} />
                </button>
              )}
              {c.isOwn && (
                <button
                  type="button"
                  disabled={pendingDeleteId === c.id}
                  onClick={() => remove(c.id)}
                  aria-label="Xoá bình luận"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-error-bg hover:text-error disabled:opacity-50"
                >
                  <TrashIcon size={17} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Nền mờ CHỈ trên điện thoại/tablet — desktop là cột bên, đọc tiếp được. */}
      <div onClick={onClose} className="fixed inset-0 z-[94] bg-brand-ink-dark/45 lg:hidden" aria-hidden />
      <aside
        role="dialog"
        aria-label="Chú thích đoạn văn"
        style={{ ["--panel-w" as string]: `${PARAGRAPH_COMMENTS_PANEL_WIDTH}px` }}
        className="fixed inset-x-0 bottom-0 z-[95] flex h-[85dvh] flex-col rounded-t-[20px] bg-surface shadow-[0_-12px_40px_rgba(0,0,0,.22)] lg:inset-x-auto lg:right-0 lg:top-0 lg:h-dvh lg:w-[var(--panel-w)] lg:rounded-none lg:border-l lg:border-cream lg:shadow-none"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-light lg:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-6 pb-3 pt-4 lg:pt-6">
          <h2 className="flex items-baseline gap-2 text-[19px] font-bold text-ink lg:text-[22px]">
            Chú thích đoạn văn
            {total > 0 && <span className="text-[14px] font-medium text-stone-light">{total}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-stone-alt transition-colors hover:bg-neutral-bg hover:text-brand-ink"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Ô viết bình luận ở TRÊN cùng (như ảnh thiết kế) — ai đọc tới đâu
            viết ngay tới đó, không phải cuộn xuống đáy danh sách. */}
        <div className="px-6 pb-4">
          <div className="flex items-end gap-2 rounded-[22px] border border-border-light px-4 py-2 focus-within:border-brand-ink">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && draft.trim() && !sending) {
                  e.preventDefault();
                  void post(draft.trim(), null);
                }
              }}
              placeholder="Bạn nghĩ sao?"
              rows={1}
              className="max-h-32 min-h-[26px] min-w-0 flex-1 resize-none bg-transparent py-1 text-[14px] text-ink outline-none placeholder:text-stone-light"
            />
            {draft.trim() && (
              <button
                type="button"
                disabled={sending}
                onClick={() => post(draft.trim(), null)}
                aria-label="Gửi bình luận"
                className="mb-0.5 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-navy disabled:opacity-50"
              >
                <PaperPlaneRightIcon size={16} weight="fill" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <Alert tone="error" className="mx-6 mb-3 rounded-lg px-3 py-2 text-[12.5px] font-medium">
            {error}
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-8">
          {threads.length === 0 ? (
            <div className="py-10 text-center text-[13.5px] text-stone-light">
              Chưa có bình luận nào cho đoạn này — hãy là người đầu tiên.
            </div>
          ) : (
            threads.map((t) => {
              const isExpanded = expanded.has(t.top.id);
              return (
                <div key={t.top.id} className="border-b border-cream py-4 first:pt-1 last:border-b-0">
                  {renderOne(t.top, false)}
                  {t.replies.length > 0 && (
                    <div className="ml-12">
                      {isExpanded ? (
                        t.replies.map((r) => renderOne(r, true))
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => new Set(prev).add(t.top.id))}
                          className="mt-2 flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[.3px] text-stone-alt transition-colors hover:text-brand-ink"
                        >
                          <ChatCircleIcon size={15} weight="fill" /> Xem {t.replies.length} lời trả lời
                        </button>
                      )}
                    </div>
                  )}
                  {replyTo?.id === t.top.id && (
                    <div className="ml-12 mt-3 flex items-end gap-2 rounded-2xl border border-border-light px-3 py-2 focus-within:border-brand-ink">
                      <textarea
                        autoFocus
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setReplyTo(null);
                            setReplyDraft("");
                          }
                        }}
                        placeholder={`Trả lời ${replyTo.authorName}…`}
                        rows={2}
                        className="min-w-0 flex-1 resize-none bg-transparent text-[13.5px] text-ink outline-none"
                      />
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={sending || !replyDraft.trim()}
                          onClick={() => post(replyDraft.trim(), t.top.id)}
                          className="cursor-pointer rounded-full bg-brand-gold px-3 py-1 text-[12px] font-bold text-brand-navy disabled:opacity-50"
                        >
                          Gửi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyDraft("");
                          }}
                          className="cursor-pointer rounded-full px-3 py-1 text-[12px] font-semibold text-stone-dark hover:bg-neutral-bg"
                        >
                          Huỷ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
