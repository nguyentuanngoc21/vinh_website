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
  PencilSimpleIcon,
  StackIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field, Textarea, Select, Button, Alert, Checkbox } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import { ART_STYLES, ART_STYLE_LABEL } from "@/lib/design/art-styles";
import { useOrigin } from "@/lib/use-origin";
import { DisplayImage } from "@/components/ui/display-image";
import type { ArtStyle, DesignItemCategory } from "@/lib/supabase/types";

type MyAlbum = {
  id: string;
  name: string;
  art_style: ArtStyle;
  description: string | null;
};

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
  const [editDraft, setEditDraft] = useState<MyDesignItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const openEdit = (item: MyDesignItem) => {
    if (item.albumId) {
      const album = albums.find((a) => a.id === item.albumId);
      if (album) { openEditAlbum(album); return; }
    }
    let draft = item;
    try {
      const stored = sessionStorage.getItem(`design-edit:${item.id}`);
      if (stored) draft = { ...item, ...JSON.parse(stored), id: item.id };
    } catch { /* Storage is optional. */ }
    setEditDraft(draft);
    setSaveError(null);
    setEditingId(item.id);
  };
  const cancelEdit = () => {
    if (saving) return;
    if (editingId) { try { sessionStorage.removeItem(`design-edit:${editingId}`); } catch {} }
    setEditingId(null);
    setEditDraft(null);
  };
  const [copied, setCopied] = useState(false);
  const [shareTokenPending, setShareTokenPending] = useState(false);

  const [albums, setAlbums] = useState<MyAlbum[]>([]);
  const [editingAlbum, setEditingAlbum] = useState<MyAlbum | null>(null);
  const [albumDraft, setAlbumDraft] = useState<{ name: string; artStyle: ArtStyle; description: string }>({
    name: "",
    artStyle: "anime_manga",
    description: "",
  });
  const [albumSaving, setAlbumSaving] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);

  const loadAlbums = () => {
    fetch("/api/design/albums")
      .then((res) => res.json())
      .then((data) => setAlbums(data?.albums ?? []))
      .catch(() => { });
  };

  useEffect(() => {
    fetch("/api/design/mine")
      .then((res) => res.json())
      .then((data) => setItems(data?.items ?? []))
      .catch(() => setLoadError("Không tải được danh sách ảnh."));
    loadAlbums();
  }, []);

  const openEditAlbum = (album: MyAlbum) => {
    setEditingAlbum(album);
    let draft = { name: album.name, artStyle: album.art_style, description: album.description ?? "" };
    try {
      const stored = sessionStorage.getItem(`design-album-edit:${album.id}`);
      if (stored) draft = { ...draft, ...JSON.parse(stored) };
    } catch {}
    setAlbumDraft(draft);
    setAlbumError(null);
  };

  const patchAlbumDraft = (patch: Partial<typeof albumDraft>) => {
    const next = { ...albumDraft, ...patch };
    setAlbumDraft(next);
    try { sessionStorage.setItem(`design-album-edit:${editingAlbum?.id}`, JSON.stringify(next)); } catch {}
  };
  const closeAlbum = () => {
    if (albumSaving) return;
    try { sessionStorage.removeItem(`design-album-edit:${editingAlbum?.id}`); } catch {}
    setEditingAlbum(null);
  };

  const saveAlbumChanges = async () => {
    if (!editingAlbum) return;
    if (!albumDraft.name.trim()) {
      setAlbumError("Tên album không được để trống.");
      return;
    }
    setAlbumSaving(true);
    setAlbumError(null);
    try {
      const res = await fetch(`/api/design/albums/${editingAlbum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: albumDraft.name.trim(),
          artStyle: albumDraft.artStyle,
          description: albumDraft.description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAlbumError(data?.error || "Lưu album thất bại.");
        setAlbumSaving(false);
        return;
      }
      setAlbums((prev) =>
        prev.map((a) =>
          a.id === editingAlbum.id
            ? {
              ...a,
              name: albumDraft.name.trim(),
              art_style: albumDraft.artStyle,
              description: albumDraft.description.trim() || null,
            }
            : a
        )
      );
      setItems((prev) =>
        prev
          ? prev.map((it) => (it.albumId === editingAlbum.id ? { ...it, albumName: albumDraft.name.trim() } : it))
          : prev
      );
      try { sessionStorage.removeItem(`design-album-edit:${editingAlbum.id}`); } catch {}
      setEditingAlbum(null);
    } catch {
      setAlbumError("Lỗi kết nối khi lưu album.");
    } finally {
      setAlbumSaving(false);
    }
  };

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
    if (!editDraft || saving) return;
    const next = { ...editDraft, ...patch };
    setEditDraft(next);
    try { sessionStorage.setItem(`design-edit:${editingId}`, JSON.stringify(next)); } catch {}
  };

  const saveEditing = async () => {
    if (!editDraft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/design/${editDraft.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editDraft.title, description: editDraft.description ?? "",
          category: editDraft.category, altText: editDraft.altText ?? "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((prev) => prev?.map((item) => item.id === editDraft.id ? editDraft : item) ?? prev);
      try { sessionStorage.removeItem(`design-edit:${editDraft.id}`); } catch {}
      setEditingId(null);
      setEditDraft(null);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "L\u1ed7i k\u1ebft n\u1ed1i. Vui l\u00f2ng th\u1eed l\u1ea1i."); }
    finally { setSaving(false); }
  };

  const regenerateShareToken = async () => {
    if (!editingId) return;
    setShareTokenPending(true);
    const res = await fetch(`/api/design/${editingId}/share-token`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setShareTokenPending(false);
    if (res.ok && data?.shareToken) {
      setItems((prev) => (prev ? prev.map((it) => (it.id === editingId ? { ...it, shareToken: data.shareToken } : it)) : prev));
      setEditDraft((prev) => prev ? { ...prev, shareToken: data.shareToken } : prev);
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

  const editing = editingId ? editDraft : null;

  if (loadError) {
    return <Alert tone="error">{loadError}</Alert>;
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
      <div className="rounded-2xl border border-dashed border-border-light px-8 py-14 text-center">
        <p className="text-sm text-stone-dark">Bạn chưa đăng ảnh nào.</p>
        <Link
          href="/thiet-ke/new"
          className="mt-4 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-navy no-underline"
        >
          Đăng thiết kế
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Danh sách Album của tôi */}
      {albums.length > 0 && (
        <div className="mb-8 rounded-2xl border border-border-light bg-neutral-bg/60 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StackIcon size={18} className="text-brand-gold-dark" />
              <h2 className="text-[15px] font-bold text-brand-ink">
                Album của tôi ({albums.length})
              </h2>
            </div>
            <span className="text-xs text-stone">
              Bấm &quot;Sửa&quot; để đổi tên, phong cách hoặc mô tả
            </span>
          </div>
          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => {
              const count = items?.filter((it) => it.albumId === a.id).length ?? 0;
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border-light bg-surface p-3.5 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-brand-ink">
                      {a.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-stone">
                      <span className="rounded-full bg-cream-gold px-2 py-0.5 font-medium text-brand-gold-dark">
                        {ART_STYLE_LABEL[a.art_style] ?? a.art_style}
                      </span>
                      <span>· {count} ảnh</span>
                    </div>
                    {a.description && (
                      <p className="mt-1.5 line-clamp-2 text-[12px] text-stone-dark">
                        {a.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditAlbum(a)}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-brand-ink transition-colors hover:border-brand-gold hover:bg-surface-gold"
                  >
                    <PencilSimpleIcon size={13} /> Sửa
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checkedIds.size > 0 && (
        <Button
          type="button"
          variant="danger-outline"
          size="sm"
          fullWidth={false}
          onClick={deleteChecked}
          disabled={bulkDeletePending}
          className="mb-4 gap-1.5 text-[12.5px] font-semibold"
        >
          <TrashIcon size={14} /> Xóa ({checkedIds.size})
        </Button>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.id} className="relative overflow-hidden rounded-2xl border border-border-light bg-neutral-bg">
            <span className="absolute left-2.5 top-2.5 z-10">
              <Checkbox checked={checkedIds.has(item.id)} onChange={() => toggleChecked(item.id)}>
                <span className="sr-only">Chọn ảnh</span>
              </Checkbox>
            </span>
            <button
              type="button"
              onClick={() => openEdit(item)}
              className="block w-full cursor-pointer text-left"
              title="Sửa thông tin / lấy link chia sẻ"
            >
              <DisplayImage src={item.imageUrl} displayWidth={320} alt={item.albumName || item.title} className="block h-40 w-full object-cover" />
            </button>
            <div className="p-2.5">
              <button
                type="button"
                onClick={() => openEdit(item)}
                className="block w-full cursor-pointer truncate text-left text-[12.5px] font-semibold text-ink hover:text-brand-gold-dark"
              >
                {item.albumName || item.title}
              </button>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${item.published ? "bg-success-form-bg text-success-form" : "bg-cream-gold text-brand-gold-dark"
                    }`}
                >
                  {item.published ? "Đã công khai" : "Chưa công khai"}
                </span>
                {item.albumName && <span className="truncate">{item.albumName}</span>}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border-light py-1.5 text-[12px] font-semibold text-stone-dark transition-colors hover:border-brand-gold hover:bg-cream-card"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => deleteOne(item.id)}
                  disabled={deletePendingId === item.id}
                  title="Xóa"
                  className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-stone-dark transition-colors hover:bg-error-bg hover:text-error disabled:opacity-60"
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
          onClick={cancelEdit}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-ink-dark/62 p-4 sm:p-10"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="grid w-full max-w-[880px] max-h-[90vh] overflow-y-auto rounded-[22px] bg-surface shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:grid-cols-[1fr_1.1fr]"
          >
            <DisplayImage src={editing.imageUrl} alt={editing.title} className="min-h-[220px] w-full object-cover sm:min-h-full" />
            <div className="flex min-w-0 flex-col gap-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${editing.published ? "bg-success-form-bg text-success-form" : "bg-cream-gold text-brand-gold-dark"
                    }`}
                >
                  {editing.published ? "Đã công khai" : "Chưa công khai"}
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone hover:bg-neutral-bg"
                >
                  <XIcon size={16} />
                </button>
              </div>

              {saveError && <Alert tone="error">{saveError}</Alert>}
              <div className="flex gap-2">
                <Button type="button" onClick={saveEditing} disabled={saving}>{saving ? "\u0110ang l\u01b0u..." : "L\u01b0u"}</Button>
                <Button type="button" variant="ghost" onClick={cancelEdit} disabled={saving}>{"H\u1ee7y"}</Button>
              </div>
              <Field
                label="Tên tác phẩm"
                disabled={saving}
                value={editing.title}
                onChange={(e) => patchEditing({ title: e.target.value })}
                placeholder="Nhập tên tác phẩm…"
              />

              <Textarea
                label="Mô tả"
                disabled={saving}
                value={editing.description ?? ""}
                onChange={(e) => patchEditing({ description: e.target.value })}
                rows={3}
                placeholder="Chất liệu, cảm hứng, hoặc bối cảnh sáng tác…"
              />

              <Select
                label="Loại sản phẩm"
                disabled={saving}
                value={editing.category ?? ""}
                onChange={(e) => patchEditing({ category: e.target.value as DesignItemCategory })}
              >
                {DESIGN_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>

              <Field
                label="Alt text"
                disabled={saving}
                value={editing.altText ?? ""}
                onChange={(e) => patchEditing({ altText: e.target.value })}
                placeholder="Mô tả ngắn cho người dùng máy đọc màn hình"
              />

              <div className="rounded-xl border border-border-light p-3.5">
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
                className="mt-auto flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border-light py-2.5 text-[13px] font-semibold text-stone-dark transition-colors hover:bg-error-bg hover:text-error disabled:opacity-60"
              >
                <TrashIcon size={14} /> {deletePendingId === editing.id ? "Đang xoá…" : "Xóa ảnh này"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh sửa Album */}
      {editingAlbum && (
        <Modal
          open={Boolean(editingAlbum)}
          onClose={closeAlbum}
          panelClassName="max-w-md p-6"
        >
          <div className="flex items-center justify-between border-b border-border-light pb-3">
            <h3 className="text-base font-bold text-brand-ink">
              Chỉnh sửa album
            </h3>
            <button
              type="button"
              onClick={closeAlbum}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-stone hover:bg-neutral-bg"
            >
              <XIcon size={16} />
            </button>
          </div>

          {albumError && <Alert tone="error" className="mt-3">{albumError}</Alert>}

          <div className="mt-4 flex flex-col gap-3.5">
            <Field
              label="Tên album"
              disabled={albumSaving}
              value={albumDraft.name}
              onChange={(e) => patchAlbumDraft({ name: e.target.value })}
              placeholder="Nhập tên album…"
            />

            <Select
              label="Phong cách nghệ thuật"
              disabled={albumSaving}
              value={albumDraft.artStyle}
              onChange={(e) => patchAlbumDraft({ artStyle: e.target.value as ArtStyle })}
            >
              {ART_STYLES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>

            <Textarea
              label="Mô tả album (tùy chọn)"
              disabled={albumSaving}
              value={albumDraft.description}
              onChange={(e) => patchAlbumDraft({ description: e.target.value })}
              rows={3}
              placeholder="Mô tả chung cho bộ sưu tập này…"
            />

            <p className="text-[11.5px] leading-[1.5] text-stone">
              Tên, phong cách và mô tả mới sẽ được cập nhật đồng bộ cho tất cả các ảnh thuộc album này.
            </p>

            <div className="mt-2 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                fullWidth={false}
                onClick={closeAlbum}
                disabled={albumSaving}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                fullWidth={false}
                onClick={saveAlbumChanges}
                disabled={albumSaving}
              >
                {albumSaving ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
