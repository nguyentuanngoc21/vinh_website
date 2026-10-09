"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParagraphCommentThread } from "@/lib/reading/paragraph-comments";

/** 1 trang bình luận từ GET /api/chapters/:chapterId/comments?scope=chapter|paragraph. */
export type CommentPage = {
  threads: ParagraphCommentThread[];
  page: number;
  pageSize: number;
  totalThreads: number;
  totalComments: number;
  /** Chỉ scope=chapter: bình luận tác giả ghim (không nằm trong threads). */
  pinned?: ParagraphCommentThread | null;
  /** Chỉ scope=chapter: viewer là tác giả truyện (được ghim). */
  canPin?: boolean;
};

/**
 * Tải bình luận theo trang (phân trang ở server, 8 bình luận gốc/trang) —
 * dùng chung cho section "Bình luận chương" và panel "Chú thích đoạn văn".
 * `url` đã có sẵn query (vd `...?scope=chapter`), hook tự nối `&page=N`.
 * `enabled=false` hoãn lần tải đầu (section chỉ tải khi cuộn tới gần).
 */
export function useCommentPages(url: string, enabled = true) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CommentPage | null>(null);
  // Tăng để buộc tải lại trang hiện tại (sau khi gửi/xoá/ghim).
  const [reloadKey, setReloadKey] = useState(0);
  // Trạng thái tải suy ra từ "đã xong yêu cầu nào" thay vì setLoading trong
  // effect (react-hooks/set-state-in-effect).
  const requestKey = `${page}:${reloadKey}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // 1 mốc "bây giờ" cho cả danh sách (không gọi Date.now() khi render —
  // react-hooks/purity), làm mới mỗi lần tải trang.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const key = `${page}:${reloadKey}`;
    fetch(`${url}&page=${page}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: CommentPage | null) => {
        if (cancelled) return;
        if (!json) {
          setFailedKey(key);
          return;
        }
        // Xoá bình luận cuối của trang cuối → trang đó rỗng, lùi 1 trang.
        if (json.threads.length === 0 && json.page > 1) {
          setPage(json.page - 1);
          return;
        }
        setData(json);
        setNow(Date.now());
        setSettledKey(key);
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, url, page, reloadKey]);

  const loadError = failedKey === requestKey;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalThreads / data.pageSize)) : 1;
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    data,
    setData,
    page,
    setPage,
    totalPages,
    loading: enabled && settledKey !== requestKey && !loadError,
    loadError,
    now,
    reload,
  };
}

/** Thêm 1 reply vừa gửi vào đúng thread đang hiển thị (kể cả thread ghim). */
export function appendReply(prev: CommentPage | null, reply: ParagraphCommentThread["top"]): CommentPage | null {
  if (!prev || !reply.parentCommentId) return prev;
  const attach = (t: ParagraphCommentThread) =>
    t.top.id === reply.parentCommentId ? { ...t, replies: [...t.replies, reply] } : t;
  return {
    ...prev,
    totalComments: prev.totalComments + 1,
    pinned: prev.pinned ? attach(prev.pinned) : prev.pinned,
    threads: prev.threads.map(attach),
  };
}
