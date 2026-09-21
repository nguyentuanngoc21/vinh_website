"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrashIcon, ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Checkbox } from "@/components/ui";

type MyDesignItem = {
  id: string;
  title: string;
  imageUrl: string;
  categoryLabel: string;
  published: boolean;
  createdAt: string;
  albumName: string | null;
};

/**
 * Trang /thiet-ke/quan-ly — cho họa sĩ xem lại và XOÁ ảnh đã đăng (khác
 * form đăng /thiet-ke/new chỉ giữ danh sách trong state của phiên hiện
 * tại, mất khi rời trang — không có cách nào sửa 1 ảnh đăng sai sau khi
 * đã bấm "Hoàn tất" hoặc rời trang trước đó). Đọc lại từ server qua GET
 * /api/design/mine, xoá qua POST /api/design/bulk-delete (soft-delete,
 * cùng route form đăng đang dùng).
 */
export function DesignManageGallery() {
  const [items, setItems] = useState<MyDesignItem[] | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/design/mine")
      .then((res) => res.json())
      .then((data) => setItems(data?.items ?? []))
      .catch(() => setLoadError("Không tải được danh sách ảnh."));
  }, []);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOne = async (id: string) => {
    setDeletePendingId(id);
    const res = await fetch("/api/design/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setDeletePendingId(null);
    if (!res.ok) return;
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const deleteChecked = async () => {
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    setBulkDeletePending(true);
    const res = await fetch("/api/design/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBulkDeletePending(false);
    if (!res.ok) return;
    setItems((prev) => (prev ? prev.filter((it) => !checkedIds.has(it.id)) : prev));
    setCheckedIds(new Set());
  };

  if (loadError) {
    return <p className="text-sm text-[#B02A37]">{loadError}</p>;
  }

  if (items === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone">
        <ArrowClockwiseIcon size={16} className="animate-spin" /> Đang tải…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e2ded7] px-8 py-14 text-center">
        <p className="text-sm text-stone-dark">Bạn chưa đăng ảnh nào.</p>
        <Link
          href="/thiet-ke/new"
          className="mt-4 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-ink no-underline"
        >
          Đăng thiết kế
        </Link>
      </div>
    );
  }

  return (
    <div>
      {checkedIds.size > 0 && (
        <button
          type="button"
          onClick={deleteChecked}
          disabled={bulkDeletePending}
          className="mb-4 flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#FDECEC] px-4 py-2 text-[12.5px] font-semibold text-[#B02A37] disabled:opacity-60"
        >
          <TrashIcon size={14} /> Xóa ({checkedIds.size})
        </button>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.id} className="relative overflow-hidden rounded-2xl border border-[#e2ded7] bg-neutral-bg">
            <span className="absolute left-2.5 top-2.5 z-10">
              <Checkbox checked={checkedIds.has(item.id)} onChange={() => toggleChecked(item.id)}>
                <span className="sr-only">Chọn ảnh</span>
              </Checkbox>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.title} className="block h-40 w-full object-cover" />
            <div className="p-2.5">
              <div className="truncate text-[12.5px] font-semibold text-ink">{item.title}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    item.published ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-[#fdf2d8] text-brand-gold-dark"
                  }`}
                >
                  {item.published ? "Đã công khai" : "Chưa công khai"}
                </span>
                {item.albumName && <span className="truncate">{item.albumName}</span>}
              </div>
              <button
                type="button"
                onClick={() => deleteOne(item.id)}
                disabled={deletePendingId === item.id}
                className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e2ded7] py-1.5 text-[12px] font-semibold text-stone-dark transition-colors hover:bg-[#FDECEC] hover:text-[#B02A37] disabled:opacity-60"
              >
                <TrashIcon size={13} /> {deletePendingId === item.id ? "Đang xoá…" : "Xóa"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
