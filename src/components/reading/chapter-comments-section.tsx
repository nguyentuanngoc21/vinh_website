"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChatCircleIcon,
  ChatsCircleIcon,
  PaperPlaneRightIcon,
  PushPinIcon,
  PushPinSlashIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";
import { relativeTimeLabel } from "@/lib/format-time";
import type { ParagraphComment, ParagraphCommentThread } from "@/lib/reading/paragraph-comments";
import type { ThemeColors } from "./reader";
import { appendReply, useCommentPages } from "./use-comment-pages";
import { CommentPagination } from "./comment-pagination";

type ChapterCommentsSectionProps = {
  chapterId: string;
  /** Đường dẫn trang đọc hiện tại — quay lại đây sau khi đăng nhập. */
  returnTo: string;
  isLoggedIn: boolean;
  /** false khi chương còn khoá (chưa đăng nhập/chưa mua) — vẫn xem được
   * bình luận nhưng không viết (API cũng chặn bằng checkChapterAccess). */
  canComment: boolean;
  c: ThemeColors;
};

/**
 * "Bình luận chương" — section cuối trang đọc, bình luận cho CẢ chương
 * (anchored_comments có paragraph_index NULL, khác "Chú thích đoạn văn" ở
 * paragraph-comments-panel.tsx). Phân trang ở server (8 bình luận gốc mỗi
 * trang, mới nhất trước — xem api/chapters/[chapterId]/comments/route.ts);
 * khung danh sách giới hạn chiều cao (~640px desktop, 70dvh điện thoại) và
 * tự cuộn bên trong khi người đọc mở nhiều lời trả lời, để section không
 * đẩy trang dài vô hạn. Chỉ tải khi người đọc cuộn gần tới cuối chương.
 *
 * Tác giả ghim được 1 bình luận gốc — luôn hiện ở đầu section (mọi trang),
 * không lặp lại trong danh sách phân trang. Bình luận ghim cũng hiện khi
 * hover chương ở danh sách chương (/truyen/[slug], chapter-list.tsx).
 */
export function ChapterCommentsSection({ chapterId, returnTo, isLoggedIn, canComment, c }: ChapterCommentsSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const { data, setData, page, setPage, totalPages, loading, loadError, now, reload } = useCommentPages(
    `/api/chapters/${chapterId}/comments?scope=chapter`,
    visible
  );
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const goToPage = (next: number) => {
    setPage(next);
    setReplyTo(null);
    setReplyDraft("");
    listRef.current?.scrollTo({ top: 0 });
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const post = async (content: string, parentCommentId: string | null) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, scope: "chapter", parentCommentId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.comment) {
        setError((json && typeof json.error === "string" && json.error) || "Gửi bình luận thất bại.");
        return;
      }
      if (parentCommentId) {
        // Reply: gắn thẳng vào thread đang hiển thị, không cần tải lại.
        setData((prev) => appendReply(prev, json.comment as ParagraphComment));
        setExpanded((prev) => new Set(prev).add(parentCommentId));
        setReplyTo(null);
        setReplyDraft("");
      } else {
        // Bình luận gốc mới nằm đầu trang 1 (mới nhất trước).
        setDraft("");
        if (page === 1) reload();
        else goToPage(1);
      }
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSending(false);
    }
  };

  /** Xoá / ghim / bỏ ghim — xong thì tải lại trang hiện tại (xoá 1 bình
   * luận gốc làm dồn bình luận trang sau lên; ghim đổi vị trí thread). */
  const act = async (commentId: string, method: "DELETE" | "POST", path: "" | "/pin", fallback: string) => {
    if (pendingId) return;
    setPendingId(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/comments/${commentId}${path}`, { method });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError((json && typeof json.error === "string" && json.error) || fallback);
        return;
      }
      reload();
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPendingId(null);
    }
  };

  const canPin = data?.canPin === true;

  const renderOne = (cm: ParagraphComment, isReply: boolean) => (
    <div key={cm.id} className={isReply ? "mt-3" : ""}>
      <div className="flex items-start gap-3">
        {cm.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cm.authorAvatarUrl}
            alt={cm.authorName}
            className={`${isReply ? "size-7" : "size-9"} shrink-0 rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${isReply ? "size-7" : "size-9"} flex shrink-0 items-center justify-center rounded-full bg-brand-gold-dark text-xs font-bold text-white`}
          >
            {cm.authorName?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span style={{ color: c.ink }} className="truncate text-[14px] font-bold">
              {cm.authorName}
            </span>
            <span style={{ color: c.inkSoft }} className="shrink-0 text-[12px]">
              {relativeTimeLabel(cm.createdAt, now)}
            </span>
          </div>
          <p style={{ color: c.body }} className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
            {cm.content}
          </p>
          <div style={{ color: c.inkSoft }} className="-ml-2 mt-1 flex flex-wrap items-center gap-1">
            {!isReply && canComment && (
              <button
                type="button"
                onClick={() => setReplyTo({ id: cm.id, authorName: cm.authorName })}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-brand-ink"
              >
                <ChatCircleIcon size={15} /> Trả lời
              </button>
            )}
            {!isReply && canPin && (
              <button
                type="button"
                disabled={pendingId === cm.id}
                onClick={() =>
                  cm.isPinned
                    ? act(cm.id, "DELETE", "/pin", "Bỏ ghim thất bại.")
                    : act(cm.id, "POST", "/pin", "Ghim bình luận thất bại.")
                }
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-brand-ink disabled:opacity-50"
              >
                {cm.isPinned ? (
                  <>
                    <PushPinSlashIcon size={15} /> Bỏ ghim
                  </>
                ) : (
                  <>
                    <PushPinIcon size={15} /> Ghim
                  </>
                )}
              </button>
            )}
            {cm.isOwn && (
              <button
                type="button"
                disabled={pendingId === cm.id}
                onClick={() => act(cm.id, "DELETE", "", "Xoá bình luận thất bại.")}
                aria-label="Xoá bình luận"
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:text-error disabled:opacity-50"
              >
                <TrashIcon size={15} /> Xoá
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderThread = (t: ParagraphCommentThread) => {
    const isExpanded = expanded.has(t.top.id);
    return (
      <>
        {renderOne(t.top, false)}
        {t.replies.length > 0 && (
          <div className="ml-12">
            {isExpanded ? (
              t.replies.map((r) => renderOne(r, true))
            ) : (
              <button
                type="button"
                onClick={() => setExpanded((prev) => new Set(prev).add(t.top.id))}
                style={{ color: c.inkSoft }}
                className="mt-1 flex min-h-9 cursor-pointer items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[.3px] transition-colors hover:text-brand-ink"
              >
                <ChatCircleIcon size={15} weight="fill" /> Xem {t.replies.length} lời trả lời
              </button>
            )}
          </div>
        )}
        {replyTo?.id === t.top.id && (
          <div
            style={{ borderColor: c.hair }}
            className="ml-12 mt-3 flex items-end gap-2 rounded-2xl border px-3 py-2 focus-within:border-brand-ink"
          >
            <textarea
              autoFocus
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setReplyTo(null);
                  setReplyDraft("");
                }
              }}
              placeholder={`Trả lời ${replyTo.authorName}…`}
              rows={2}
              maxLength={2000}
              style={{ color: c.ink }}
              className="min-w-0 flex-1 resize-none bg-transparent text-[13.5px] outline-none"
            />
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                disabled={sending || !replyDraft.trim()}
                onClick={() => post(replyDraft.trim(), t.top.id)}
                className="cursor-pointer rounded-full bg-brand-gold px-3 py-1.5 text-[12px] font-bold text-brand-navy disabled:opacity-50"
              >
                Gửi
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  setReplyDraft("");
                }}
                style={{ color: c.inkSoft }}
                className="cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold hover:text-brand-ink"
              >
                Huỷ
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Bình luận chương"
      style={{ borderColor: c.hair }}
      className="mt-8 scroll-mt-24 border-t pt-7"
    >
      <h2 style={{ color: c.ink }} className="flex items-baseline gap-2 text-[18px] font-bold sm:text-[20px]">
        <ChatsCircleIcon size={22} className="self-center" /> Bình luận chương
        {data && data.totalComments > 0 && (
          <span style={{ color: c.inkSoft }} className="text-[14px] font-medium">
            {data.totalComments}
          </span>
        )}
      </h2>

      {canComment ? (
        <div
          style={{ borderColor: c.hair }}
          className="mt-4 flex items-end gap-2 rounded-[22px] border px-4 py-2 focus-within:border-brand-ink"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Bạn nghĩ gì về chương này?"
            rows={2}
            maxLength={2000}
            style={{ color: c.ink }}
            className="max-h-40 min-h-[48px] min-w-0 flex-1 resize-y bg-transparent py-1 text-[14px] outline-none placeholder:text-stone-light"
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => post(draft.trim(), null)}
            aria-label="Gửi bình luận"
            className="mb-0.5 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-navy disabled:cursor-default disabled:opacity-50"
          >
            <PaperPlaneRightIcon size={17} weight="fill" />
          </button>
        </div>
      ) : !isLoggedIn ? (
        <div style={{ color: c.inkSoft }} className="mt-4 text-[13.5px]">
          <Link
            href={`/dang-nhap?next=${encodeURIComponent(returnTo)}`}
            className="font-semibold text-brand-gold-dark underline-offset-2 hover:underline"
          >
            Đăng nhập
          </Link>{" "}
          để bình luận về chương này.
        </div>
      ) : (
        <div style={{ color: c.inkSoft }} className="mt-4 text-[13.5px]">
          Mở khoá chương để tham gia bình luận.
        </div>
      )}

      {error && (
        <Alert tone="error" className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-medium">
          {error}
        </Alert>
      )}

      {data?.pinned && (
        <div
          style={{ borderColor: c.tintBorder, background: c.tintBg }}
          className="mt-5 rounded-[14px] border px-4 py-3.5"
        >
          <div
            style={{ color: c.tintInk }}
            className="mb-2.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[.3px]"
          >
            <PushPinIcon size={14} weight="fill" /> Tác giả đã ghim
          </div>
          {renderThread(data.pinned)}
        </div>
      )}

      <div
        ref={listRef}
        className="mt-5 max-h-[70dvh] overflow-y-auto overscroll-contain pr-1 sm:max-h-[640px]"
      >
        {!data ? (
          <div style={{ color: c.inkSoft }} className="py-8 text-center text-[13.5px]">
            {loadError ? "Không tải được bình luận." : "Đang tải bình luận…"}
          </div>
        ) : data.threads.length === 0 ? (
          !data.pinned && (
            <div style={{ color: c.inkSoft }} className="py-8 text-center text-[13.5px]">
              Chưa có bình luận nào cho chương này — hãy là người đầu tiên.
            </div>
          )
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {data.threads.map((t) => (
              <div key={t.top.id} style={{ borderColor: c.hair }} className="border-b py-4 first:pt-0 last:border-b-0">
                {renderThread(t)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <CommentPagination
          page={page}
          totalPages={totalPages}
          disabled={loading}
          onChange={goToPage}
          buttonStyle={{ borderColor: c.hair, color: c.ink }}
          labelStyle={{ color: c.inkSoft }}
        />
      </div>
    </section>
  );
}
