"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@phosphor-icons/react/dist/ssr";
import { BookCover } from "@/components/covers/book-cover";
import type { BookGenre } from "@/lib/supabase/types";

type BookCoverUploadProps = {
  bookId: string;
  bookTitle: string;
  bookGenre: BookGenre | null;
  coverUrl: string | null;
  className?: string;
};

const COVER_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Ô bìa truyện có thể bấm để đổi — dùng trong book-overview.tsx (trang
 * tổng quan 1 truyện). Nút camera luôn hiện (không chỉ khi hover) để còn
 * dùng được trên màn hình cảm ứng. Gọi POST/DELETE
 * /api/authoring/books/[bookId]/cover — xem route đó để biết vì sao phải
 * đi qua link_cover_to_book() thay vì update thẳng cover_design_item_id.
 */
export function BookCoverUpload({
  bookId,
  bookTitle,
  bookGenre,
  coverUrl: initialCoverUrl,
  className,
}: BookCoverUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cho phép chọn lại đúng file đó ở lần sau.
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Chỉ nhận file ảnh.");
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError("Ảnh bìa tối đa 8MB.");
      return;
    }

    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("cover", file);
    const res = await fetch(`/api/authoring/books/${bookId}/cover`, { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Tải ảnh bìa thất bại.");
      return;
    }
    setCoverUrl(data.coverUrl ?? null);
    // Sidebar (author/layout.tsx) query bìa riêng, tự làm mới theo.
    router.refresh();
  };

  return (
    <div className={`relative shrink-0 ${className ?? "h-[136px] w-[96px]"}`}>
      <div className="h-full w-full overflow-hidden rounded-[10px] border border-cream-border">
        <BookCover id={bookId} title={bookTitle} genre={bookGenre} coverUrl={coverUrl} className="h-full w-full" />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={handlePick}
        disabled={pending}
        title="Đổi ảnh bìa"
        className="absolute -bottom-2 -right-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-brand-ink text-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform hover:scale-105 disabled:cursor-default disabled:opacity-70"
      >
        <CameraIcon weight="fill" size={13} />
      </button>
      {error && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-10 rounded-md bg-[#FDECEC] px-2 py-1 text-[11px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}
    </div>
  );
}
