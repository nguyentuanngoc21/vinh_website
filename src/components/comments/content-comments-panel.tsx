"use client";

import { useEffect, useState } from "react";
import { XIcon, TrashIcon, ArrowBendUpLeftIcon, HeartIcon } from "@phosphor-icons/react/dist/ssr";
import type { ContentComment, ContentCommentThread } from "@/lib/comments/content-comments";
import { groupContentComments } from "@/lib/comments/content-comments";

type ContentCommentsPanelProps = {
  title: string;
  /** vd `/api/design/${designItemId}` hoặc `/api/audio/${audioNarrationId}`
   * — panel tự gọi `${apiBase}/comments`, `${apiBase}/comments/:id`,
   * `${apiBase}/comments/:id/like`. */
  apiBase: string;
  onClose: () => void;
};

/**
 * Modal bình luận dùng chung cho thiết kế (design-gallery.tsx) và audio
 * (now-playing.tsx) — mirror src/components/reading/paragraph-comments-panel.tsx
 * nhưng KHÔNG có khái niệm "đoạn văn" (1 danh sách thread duy nhất cho cả
 * tác phẩm) và CÓ thêm nút thích 1 bình luận (không có ở bản chapter).
 * Tự fetch/giữ state danh sách bình luận (khác panel kia — panel đó để
 * reader.tsx sở hữu state để đồng bộ với icon đếm theo đoạn; ở đây không
 * có icon đếm nào cần đồng bộ nên panel tự quản lý gọn hơn).
 */
export function ContentCommentsPanel({ title, apiBase, onClose }: ContentCommentsPanelProps) {
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/comments`);
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.comments) setComments(data.comments);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const post = async (content: string, parentCommentId: string | null) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentCommentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.comment) {
        setError((data && typeof data.error === "string" && data.error) || "Gửi bình luận thất bại.");
        return;
      }
      setComments((prev) => [...prev, data.comment]);
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
      const res = await fetch(`${apiBase}/comments/${commentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Xoá bình luận thất bại.");
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentCommentId !== commentId));
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingDeleteId(null);
    }
  };

  const toggleLike = async (commentId: string) => {
    if (pendingLikeId) return;
    setPendingLikeId(commentId);
    // Optimistic — reconcile với phản hồi server ngay sau đó.
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, liked: !c.liked, likeCount: c.likeCount + (c.liked ? -1 : 1) } : c
      )
    );
    try {
      const res = await fetch(`${apiBase}/comments/${commentId}/like`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.liked !== "boolean") {
        // Rơi về trạng thái cũ khi thất bại (vd 401 chưa đăng nhập) —
        // không hiện lỗi ồn ào, cùng cách design-gallery.tsx xử lý.
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, liked: !c.liked, likeCount: c.likeCount + (c.liked ? -1 : 1) } : c
          )
        );
        return;
      }
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, liked: data.liked, likeCount: data.likeCount } : c)));
    } finally {
      setPendingLikeId(null);
    }
  };

  const threads: ContentCommentThread[] = groupContentComments(comments);

  const renderOne = (c: ContentComment, isReply: boolean) => (
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
            <button
              type="button"
              disabled={pendingLikeId === c.id}
              onClick={() => toggleLike(c.id)}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-stone-alt transition-colors disabled:opacity-50"
              style={c.liked ? { color: "#B02A37" } : undefined}
            >
              <HeartIcon size={12} weight={c.liked ? "fill" : "regular"} /> {c.likeCount > 0 ? c.likeCount : "Thích"}
            </button>
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
          <div className="text-[15.5px] font-bold text-brand-ink">{title}</div>
          <button type="button" onClick={onClose} className="cursor-pointer text-stone-alt hover:text-brand-ink">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-6 text-center text-[13px] text-stone-light">Đang tải bình luận…</div>
          ) : threads.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-stone-light">
              Chưa có bình luận nào — hãy là người đầu tiên.
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
            placeholder="Viết bình luận…"
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
