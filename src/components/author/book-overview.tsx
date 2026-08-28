"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowSquareOutIcon, CoinsIcon, PlusIcon, TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { ImportManuscriptModal } from "@/components/author/import-manuscript-modal";
import { BookCoverUpload } from "@/components/author/book-cover-upload";
import type { BookGenre } from "@/lib/supabase/types";

export type OverviewChapter = {
  id: string;
  title: string;
  order_index: number;
  published: boolean;
  price: number;
  is_last_chapter: boolean;
};

type BookOverviewProps = {
  bookId: string;
  bookTitle: string;
  bookGenre: BookGenre | null;
  bookSlug: string;
  bookPublished: boolean;
  bookIsExclusive: boolean;
  /** null = chưa gắn bìa thật, đã resolve sẵn từ page.tsx qua
   * resolveBookCoverUrl() — component này không tự query Supabase. */
  coverUrl: string | null;
  /** Đã order by order_index asc từ page.tsx. */
  chapters: OverviewChapter[];
};

/**
 * Trang tổng quan 1 truyện — chưa từng có trước đây (sidebar chỉ link
 * thẳng vào chương mới nhất). Đây là nơi tác giả thấy toàn bộ danh sách
 * chương và là đích của luồng "Nhập bản thảo" khi thêm vào truyện có sẵn.
 */
export function BookOverview({
  bookId,
  bookTitle,
  bookGenre,
  bookSlug,
  bookPublished,
  bookIsExclusive,
  coverUrl,
  chapters,
}: BookOverviewProps) {
  const router = useRouter();
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const latest = chapters[chapters.length - 1] ?? null;
  const publishedCount = chapters.filter((c) => c.published).length;

  // Chỉ để hiện/disable nút — server (DELETE route) là chốt chặn thật
  // (còn kiểm cả lịch sử giao dịch mua chương, việc client không biết).
  const canDelete = !bookPublished || !bookIsExclusive;

  const handleDelete = async () => {
    if (deleting || !canDelete) return;
    if (!window.confirm(`Xoá truyện "${bookTitle}"? Truyện sẽ ẩn khỏi danh sách của bạn.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && typeof data.error === "string" && data.error) || "Không xoá được. Vui lòng thử lại.");
        setDeleting(false);
        return;
      }
      router.push("/author");
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setDeleting(false);
    }
  };

  const handleNewChapter = async () => {
    if (creatingChapter) return;
    setCreatingChapter(true);
    const nextNo = (latest?.order_index ?? 0) + 1;

    try {
      const res = await fetch(`/api/authoring/books/${bookId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: [{ title: `Chương ${nextNo}`, content: "" }] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.chapterIds?.[0]) {
        alert((data && typeof data.error === "string" && data.error) || "Không tạo được chương. Vui lòng thử lại.");
        setCreatingChapter(false);
        return;
      }
      router.push(`/author/${bookId}/${data.chapterIds[0]}`);
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setCreatingChapter(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-[#FBF8F1] px-4 py-5 lg:overflow-y-auto lg:px-9 lg:py-7">
      <div className="mb-1 flex items-center gap-2.5">
        {bookGenre && (
          <span className="rounded-full bg-neutral-bg px-3 py-1 text-xs font-medium text-ink">{bookGenre}</span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            bookPublished ? "bg-[#E4F1EA] text-[#256B4C]" : "bg-cream-card-alt text-stone-dark"
          }`}
        >
          {bookPublished ? "Đang ra" : "Bản nháp"}
        </span>
        {bookPublished && (
          <Link
            href={`/truyen/${bookSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-gold-dark no-underline transition-colors hover:text-brand-ink"
          >
            Xem trang truyện <ArrowSquareOutIcon size={13} />
          </Link>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          <BookCoverUpload bookId={bookId} bookTitle={bookTitle} bookGenre={bookGenre} coverUrl={coverUrl} />
          <div>
            <div className="font-[family-name:var(--font-lora)] text-[27px] font-bold text-brand-ink">
              {bookTitle}
            </div>
            <div className="mt-1 text-[13.5px] text-stone-alt">
              {chapters.length} chương · {publishedCount} đã đăng
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            title={
              !canDelete
                ? "Không thể xoá tác phẩm đã xuất bản ở dạng độc quyền — chuyển sang tự do trước, hoặc liên hệ quản trị viên."
                : undefined
            }
            className="flex items-center gap-1.5 rounded-[9px] border border-[#f3c6c6] bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#B02A37] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <TrashIcon size={16} /> {deleting ? "Đang xoá…" : "Xoá truyện"}
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-[9px] border border-cream-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-brand-ink"
          >
            <UploadSimpleIcon size={16} /> Nhập bản thảo
          </button>
          <button
            type="button"
            onClick={handleNewChapter}
            disabled={creatingChapter}
            className="flex items-center gap-1.5 rounded-[9px] bg-brand-gold px-4 py-2.5 text-[13.5px] font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
          >
            <PlusIcon size={16} weight="fill" /> {creatingChapter ? "Đang tạo…" : "Chương mới"}
          </button>
        </div>
      </div>

      {latest && (
        <Link
          href={`/author/${bookId}/${latest.id}`}
          className="mb-6 flex items-center justify-between rounded-[12px] border border-cream-border bg-white px-5 py-3.5 no-underline transition-colors hover:border-brand-gold"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-stone-alt">TIẾP TỤC VIẾT</div>
            <div className="mt-0.5 truncate text-[14.5px] font-semibold text-brand-ink">
              {latest.order_index}. {latest.title}
            </div>
          </div>
        </Link>
      )}

      <div className="overflow-hidden rounded-[12px] border border-cream-border bg-white">
        <div className="grid grid-cols-[40px_1fr_100px_90px] gap-3 border-b border-cream-border bg-cream-card px-4 py-2.5 text-[10.5px] font-bold tracking-wide text-stone-alt">
          <span />
          <span>CHƯƠNG</span>
          <span>TRẠNG THÁI</span>
          <span>GIÁ</span>
        </div>
        {chapters.map((c) => (
          <Link
            key={c.id}
            href={`/author/${bookId}/${c.id}`}
            className="grid grid-cols-[40px_1fr_100px_90px] items-center gap-3 border-b border-[#F2ECE0] px-4 py-3 no-underline transition-colors last:border-b-0 hover:bg-cream-card"
          >
            <span className="text-[11.5px] font-bold text-stone-alt">{c.order_index}</span>
            <span className="truncate text-[13.5px] font-semibold text-brand-ink">{c.title}</span>
            <span
              className={`w-fit rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                c.published ? "bg-[#E4F1EA] text-[#256B4C]" : "bg-cream-card-alt text-stone-dark"
              }`}
            >
              {c.published ? "Đã đăng" : "Bản nháp"}
            </span>
            <span className="flex items-center gap-1 text-[13px] font-semibold text-stone-dark">
              {c.price > 0 ? (
                <>
                  <CoinsIcon size={13} color="var(--color-brand-gold)" /> {c.price}
                </>
              ) : (
                "Miễn phí"
              )}
            </span>
          </Link>
        ))}
        {chapters.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-stone-light">Chưa có chương nào.</div>
        )}
      </div>

      <ImportManuscriptModal
        open={showImport}
        onClose={() => setShowImport(false)}
        books={[]}
        destinationBookId={bookId}
      />
    </div>
  );
}
