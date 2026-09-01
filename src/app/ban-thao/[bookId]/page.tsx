"use client";

import { use, useEffect, useState } from "react";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";

type Chapter = { id: string; title: string; content: string; order_index: number };
type ManuscriptData = {
  book: { id: string; title: string; synopsis: string | null; finalized: boolean };
  chapters: Chapter[];
  grantedAt: string;
  locked: boolean;
};

/**
 * Trình đọc bản thảo cho người ĐƯỢC SHARE (không phải tác giả) — Mục 4.3
 * đặc tả. `select-none` là biện pháp chống copy ở MỨC UI thông thường,
 * KHÔNG phải DRM thật (ảnh hoá/watermark từng trang cần thư viện xử lý
 * ảnh riêng, ngoài phạm vi phase này — xem GET
 * /api/authoring/books/:bookId/manuscript).
 */
export default function ManuscriptViewerPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const [data, setData] = useState<ManuscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/authoring/books/${bookId}/manuscript`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError((body && body.error) || "Không tải được bản thảo.");
          return;
        }
        setData(body);
        setActiveChapterId(body.chapters[0]?.id ?? null);
      })
      .catch(() => setError("Không thể kết nối máy chủ."));
  }, [bookId]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }
  if (!data) {
    return <div className="px-4 py-16 text-center text-sm text-stone-light">Đang tải…</div>;
  }

  const activeChapter = data.chapters.find((c) => c.id === activeChapterId) ?? null;

  return (
    <div className="mx-auto flex max-w-[1000px] gap-6 px-4 py-8 lg:px-8">
      <aside className="w-[220px] shrink-0">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-brand-gold-dark">
          <LockSimpleIcon size={13} /> Bản thảo được chia sẻ
        </div>
        <div className="mb-4 text-[15px] font-bold text-brand-ink">{data.book.title}</div>
        <div className="flex flex-col gap-1">
          {data.chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveChapterId(c.id)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-left text-[13px] ${
                c.id === activeChapterId ? "bg-cream-card font-semibold text-brand-ink" : "text-stone-dark"
              }`}
            >
              {c.order_index}. {c.title}
            </button>
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1 select-none" style={{ userSelect: "none" }} onCopy={(e) => e.preventDefault()}>
        {activeChapter ? (
          <>
            <div className="mb-4 text-xl font-bold text-brand-ink">{activeChapter.title}</div>
            <div className="whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">{activeChapter.content}</div>
          </>
        ) : (
          <div className="text-sm text-stone-light">Chưa có chương nào.</div>
        )}
      </main>
    </div>
  );
}
