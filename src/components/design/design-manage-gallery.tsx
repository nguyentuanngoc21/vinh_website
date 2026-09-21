"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrashIcon,
  ArrowClockwiseIcon,
  XIcon,
  LinkSimpleIcon,
  CheckIcon,
  CopyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Checkbox } from "@/components/ui";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import { useOrigin } from "@/lib/use-origin";
import type { DesignItemCategory } from "@/lib/supabase/types";

type MyDesignItem = {
  id: string;
  title: string;
  description: string | null;
  altText: string | null;
  imageUrl: string;
  category: DesignItemCategory | null;
  categoryLabel: string;
  published: boolean;
  createdAt: string;
  albumId: string | null;
  albumName: string | null;
  shareToken: string;
};

/**
 * Trang /thiet-ke/quan-ly — cho họa sĩ xem lại, SỬA thông tin, lấy lại
 * link chia sẻ, và XOÁ ảnh đã đăng (khác form đăng /thiet-ke/new chỉ giữ
 * danh sách trong state của phiên hiện tại, mất khi rời trang — không có
 * cách nào sửa/lấy lại link 1 ảnh sau khi đã bấm "Hoàn tất" hoặc rời
 * trang trước đó). Đọc lại từ server qua GET /api/design/mine, sửa qua
 * PATCH /api/design/:id, xoá qua POST /api/design/bulk-delete — cả 2
 * route đã có sẵn, dùng lại nguyên vẹn từ form đăng.
 */
export function DesignManageGallery() {
  const origin = useOrigin();
  const [items, setItems] = useState<MyDesignItem[] | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareTokenPending, setShareTokenPending] = useState(false);

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
    setEditingId((cur) => (cur === id ? null : cur));
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

  const patchEditing = (patch: Partial<Pick<MyDesignItem, "title" | "description" | "category" | "altText">>) => {
    if (!editingId) return;
    setItems((prev) => (prev ? prev.map((it) => (it.id === editingId ? { ...it, ...patch } : it)) : prev));
    fetch(`/api/design/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const regenerateShareToken = async () => {
    if (!editingId) return;
    setShareTokenPending(true);
    const res = await fetch(`/api/design/${editingId}/share-token`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setShareTokenPending(false);
    if (res.ok && data?.shareToken) {
      setItems((prev) => (prev ? prev.map((it) => (it.id === editingId ? { ...it, shareToken: data.shareToken } : it)) : prev));
    }
  };

  const copyLink = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard không khả dụng — im lặng, người dùng vẫn thấy link để tự bôi đen/copy tay.
    }
  };

  const editing = items?.find((it) => it.id === editingId) ?? null;

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
            <button
              type="button"
              onClick={() => setEditingId(item.id)}
              className="block w-full cursor-pointer text-left"
              title="Sửa thông tin / lấy link chia sẻ"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt={item.title} className="block h-40 w-full object-cover" />
            </button>
            <div className="p-2.5">
              <button
                type="button"
                onClick={() => setEditingId(item.id)}
                className="block w-full cursor-pointer truncate text-left text-[12.5px] font-semibold text-ink hover:text-brand-gold-dark"
              >
                {item.title}
              </button>
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
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingId(item.id)}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e2ded7] py-1.5 text-[12px] font-semibold text-stone-dark transition-colors hover:border-brand-gold hover:bg-[#fdf8ec]"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => deleteOne(item.id)}
                  disabled={deletePendingId === item.id}
                  title="Xóa"
                  className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e2ded7] px-2.5 py-1.5 text-[12px] font-semibold text-stone-dark transition-colors hover:bg-[#FDECEC] hover:text-[#B02A37] disabled:opacity-60"
                >
                  <TrashIcon size={13} /> {deletePendingId === item.id ? "…" : ""}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div
          onClick={() => setEditingId(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-ink-dark/62 p-4 sm:p-10"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="grid w-full max-w-[880px] max-h-[90vh] overflow-y-auto rounded-[22px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:grid-cols-[1fr_1.1fr]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editing.imageUrl} alt={editing.title} className="min-h-[220px] w-full object-cover sm:min-h-full" />
            <div className="flex min-w-0 flex-col gap-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    editing.published ? "bg-[#E8F5E9] text-[#2E7D32]" : "bg-[#fdf2d8] text-brand-gold-dark"
                  }`}
                >
                  {editing.published ? "Đã công khai" : "Chưa công khai"}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone hover:bg-neutral-bg"
                >
                  <XIcon size={16} />
                </button>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-brand-ink">Tên tác phẩm</label>
                <input
                  value={editing.title}
                  onChange={(e) => patchEditing({ title: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-brand-ink">Mô tả</label>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => patchEditing({ description: e.target.value })}
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-brand-ink">Loại sản phẩm</label>
                <select
                  value={editing.category ?? ""}
                  onChange={(e) => patchEditing({ category: e.target.value as DesignItemCategory })}
                  className="mt-1.5 w-full rounded-xl border border-[#e2ded7] bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
                >
                  {DESIGN_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-brand-ink">Alt text</label>
                <input
                  value={editing.altText ?? ""}
                  onChange={(e) => patchEditing({ altText: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
                />
              </div>

              <div className="rounded-xl border border-[#e2ded7] p-3.5">
                <button
                  type="button"
                  onClick={regenerateShareToken}
                  disabled={shareTokenPending}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-cream-border py-2.5 text-[12.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-50"
                >
                  <LinkSimpleIcon size={14} /> Tạo lại link liên kết
                </button>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <div className="min-w-0 flex-1 truncate rounded-lg bg-neutral-bg px-2.5 py-1.5 text-[11px] text-stone">
                    {origin}/lien-ket-thiet-ke?id={editing.id}&token={editing.shareToken}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(`${origin}/lien-ket-thiet-ke?id=${editing.id}&token=${editing.shareToken}`)}
                    title="Sao chép link chia sẻ"
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-bg text-brand-ink transition-colors hover:bg-brand-gold"
                  >
                    {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                  </button>
                </div>
                <p className="mt-2 text-[11.5px] leading-[1.5] text-stone">
                  Dán link này trên 1 đoạn RIÊNG (có dòng trống trước và sau) trong nội dung chương để hiển thị ảnh tại đó.
                </p>
              </div>

              <button
                type="button"
                onClick={() => deleteOne(editing.id)}
                disabled={deletePendingId === editing.id}
                className="mt-auto flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e2ded7] py-2.5 text-[13px] font-semibold text-stone-dark transition-colors hover:bg-[#FDECEC] hover:text-[#B02A37] disabled:opacity-60"
              >
                <TrashIcon size={14} /> {deletePendingId === editing.id ? "Đang xoá…" : "Xóa ảnh này"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
