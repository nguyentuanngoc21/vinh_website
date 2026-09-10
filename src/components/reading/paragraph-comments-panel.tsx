"use client";

import { useState } from "react";
import { XIcon, TrashIcon, ArrowBendUpLeftIcon } from "@phosphor-icons/react/dist/ssr";
import type { ParagraphComment, ParagraphCommentThread } from "@/lib/reading/paragraph-comments";

type ParagraphCommentsPanelProps = {
  chapterId: string;
  paragraphIndex: number;
  threads: ParagraphCommentThread[];
  onClose: () => void;
  /** paragraphIndex cố định (bình luận gốc) — reader.tsx tự thêm bình
   * luận mới vào state chung sau khi API trả về, không phải panel tự giữ
   * state riêng, để icon "+"/số đếm ở reader.tsx luôn khớp ngay. */
  onCommentCreated: (comment: ParagraphComment) => void;
  onCommentDeleted: (commentId: string) => void;
};

/**
 * Modal bình luận theo đoạn (tham khảo Wattpad) — mở từ icon cạnh mỗi
 * đoạn văn ở reader.tsx. Reply lồng CHỈ 1 CẤP: mỗi thread là 1 bình luận
 * gốc + danh sách reply thụt lề, KHÔNG có nút "Trả lời" trên chính 1
 * reply (API cũng chặn ở tầng server, xem
 * api/chapters/[chapterId]/comments/route.ts).
 *
 * Cùng khung modal với reading-list-modal.tsx (backdrop click-để-đóng +
 * panel trắng bo góc), chỉ rộng/cao hơn để chứa cả thread.
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
  const [sending, setSending] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div key={c.id} className={isReply ? "ml-9 mt-2.5" : "mt-3.5 first:mt-0"}>
      <div className="flex items-start gap-2.5">
        {c.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.authorAvatarUrl} alt={c.authorName} className="size-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gold-dark text-xs font-bold text-white">
            {c.authorName[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-brand-ink">{c.authorName}</span>
            <span className="shrink-0 text-[11px] text-stone-alt">
              {new Date(c.createdAt).toLocaleDateString("vi-VN")}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-ink">{c.content}</p>
          <div className="mt-1 flex items-center gap-3.5">
            {!isReply && (
              <button
                type="button"
                onClick={() => setReplyTo({ id: c.id, authorName: c.authorName })}
                className="flex items-center gap-1 text-[11.5px] font-semibold text-stone-alt transition-colors hover:text-brand-ink"
              >
                <ArrowBendUpLeftIcon size={12} /> Trả lời
              </button>
            )}
            {c.isOwn && (
              <button
                type="button"
                disabled={pendingDeleteId === c.id}
                onClick={() => remove(c.id)}
                className="flex items-center gap-1 text-[11.5px] font-semibold text-[#B02A37] transition-colors disabled:opacity-50"
              >
                <TrashIcon size={12} /> Xoá
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-[20px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-center justify-between border-b border-cream-border px-6 py-4">
          <div className="text-[15.5px] font-bold text-brand-ink">Bình luận đoạn này</div>
          <button type="button" onClick={onClose} className="cursor-pointer text-stone-alt hover:text-brand-ink">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {threads.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-stone-light">
              Chưa có bình luận nào cho đoạn này — hãy là người đầu tiên.
            </div>
          ) : (
            threads.map((t) => (
              <div key={t.top.id} className="border-b border-[#F1ECE0] pb-3.5 last:border-b-0">
                {renderOne(t.top, false)}
                {t.replies.map((r) => renderOne(r, true))}
                {replyTo?.id === t.top.id && (
                  <div className="ml-9 mt-2.5 flex items-start gap-2">
                    <textarea
                      autoFocus
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder={`Trả lời ${replyTo.authorName}…`}
                      rows={2}
                      className="min-w-0 flex-1 resize-none rounded-lg border border-cream-border px-3 py-2 text-[13px] outline-none focus:border-brand-ink"
                    />
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={sending || !replyDraft.trim()}
                        onClick={() => post(replyDraft.trim(), t.top.id)}
                        className="rounded-lg bg-brand-gold px-3 py-1.5 text-[12px] font-bold text-brand-ink disabled:opacity-50"
                      >
                        Gửi
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(null);
                          setReplyDraft("");
                        }}
                        className="rounded-lg border border-cream-border px-3 py-1.5 text-[12px] font-semibold text-stone-dark"
                      >
                        Huỷ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2 text-[12.5px] font-medium text-[#B02A37]">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t border-cream-border px-6 py-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Viết bình luận cho đoạn này…"
            rows={1}
            className="min-w-0 flex-1 resize-none rounded-full border border-cream-border px-4 py-2.5 text-[13.5px] outline-none focus:border-brand-ink"
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => post(draft.trim(), null)}
            className="shrink-0 rounded-full bg-brand-gold px-4 py-2.5 text-[13px] font-bold text-brand-ink disabled:opacity-50"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}
