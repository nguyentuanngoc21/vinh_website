"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { Field, Button, Alert, GenreSelect } from "@/components/ui";
import type { BookGenre } from "@/lib/supabase/types";

type CreateWorkModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal "Viết truyện" (header, src/components/auth-cluster.tsx) và
 * "+ Tác phẩm mới" (sidebar, src/components/author/works-sidebar.tsx) —
 * CÙNG mở modal này, không điều hướng vào sách cũ nào cả (sửa đúng lỗi
 * "Viết truyện" trước đây chỉ link tĩnh tới /author).
 *
 * Cùng pattern với src/components/topup/custom-amount-modal.tsx: backdrop
 * onClick=onClose, panel onClick=stopPropagation, if(!open) return null,
 * không animation.
 */
export function CreateWorkModal({ open, onClose }: CreateWorkModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<BookGenre | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const ready = title.trim().length > 0 && genre !== null && !pending;

  const handleCreate = async () => {
    if (!ready) return;
    setPending(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/authoring/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), genre }),
      });
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setPending(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.bookId || !data?.chapterId) {
      setError((data && typeof data.error === "string" && data.error) || "Không tạo được truyện. Vui lòng thử lại.");
      setPending(false);
      return;
    }

    // Đóng modal + điều hướng ngay — không reset state ở đây, modal sẽ
    // unmount theo `open`; lần mở tiếp theo (tác phẩm khác) tự khởi tạo
    // lại vì component được mount mới.
    onClose();
    router.push(`/author/${data.bookId}/${data.chapterId}`);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-[20px] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
              Tác phẩm mới
            </div>
            <div className="mt-1 text-[13px] leading-[1.6] text-stone-dark">
              Đặt tên và chọn thể loại — có thể đổi lại sau khi tạo.
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
            <XIcon size={20} />
          </button>
        </div>

        <div className="mt-5">
          <Field
            label="Tên truyện"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Vũng Vịnh Cuối Trời"
            autoFocus
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[13px] font-semibold text-slate">Thể loại</div>
          <GenreSelect value={genre} onChange={setGenre} />
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="mt-6">
          <Button type="button" onClick={handleCreate} disabled={!ready}>
            {pending ? "Đang tạo…" : "Tạo truyện"}
          </Button>
        </div>
      </div>
    </div>
  );
}
