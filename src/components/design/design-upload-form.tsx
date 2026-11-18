"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadSimpleIcon,
  TrashIcon,
  CheckIcon,
  CopyIcon,
  ArrowClockwiseIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import { ART_STYLES } from "@/lib/design/art-styles";
import { compressImageFile } from "@/lib/media/compress-image";
import { DisplayImage } from "@/components/ui/display-image";
import { useOrigin } from "@/lib/use-origin";
import { Field, Textarea, Select, Button, Alert, Checkbox } from "@/components/ui";
import type { ArtStyle, DesignItemCategory } from "@/lib/supabase/types";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

type ExistingAlbum = { id: string; name: string; art_style: ArtStyle; description?: string | null };

// null trong khi ảnh còn đang upload (chưa có id thật, chưa gọi được
// PATCH/share-token cho nó) — mirror "Pin drafts" trong ảnh mẫu Pinterest:
// mỗi ảnh tự lưu ngay khi chọn, không đợi 1 nút "Đăng" tổng.
type DraftItem = {
  key: string; // ổn định qua re-render dù id còn null (dùng cho React key + chọn ảnh)
  id: string | null;
  imageUrl: string | null;
  previewUrl: string;
  title: string;
  description: string;
  category: DesignItemCategory;
  altText: string;
  uploading: boolean;
  error: string | null;
  shareToken: string | null;
  shareTokenPending: boolean;
};

function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Tác phẩm mới";
}

export function DesignUploadForm({ className }: { className?: string }) {
  const router = useRouter();
  const origin = useOrigin();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [albumName, setAlbumName] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [artStyle, setArtStyle] = useState<ArtStyle | "">("");
  const [existingAlbums, setExistingAlbums] = useState<ExistingAlbum[]>([]);
  const activeAlbumIdRef = useRef<string | null>(null);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [albumSaveStatus, setAlbumSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/design/albums")
      .then((res) => res.json())
      .then((data) => setExistingAlbums(data?.albums ?? []))
      .catch(() => { });
  }, []);

  const matchedAlbum = existingAlbums.find((a) => a.name.trim().toLowerCase() === albumName.trim().toLowerCase());

  const patchAlbum = async (patch: { name?: string; artStyle?: ArtStyle | ""; description?: string }) => {
    const albumId = activeAlbumIdRef.current;
    if (!albumId) return;
    setAlbumSaveStatus("saving");
    try {
      const res = await fetch(`/api/design/albums/${albumId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name !== undefined ? patch.name.trim() || undefined : undefined,
          artStyle: patch.artStyle ? patch.artStyle : undefined,
          description: patch.description !== undefined ? patch.description.trim() || null : undefined,
        }),
      });
      if (res.ok) {
        setAlbumSaveStatus("saved");
        setTimeout(() => setAlbumSaveStatus("idle"), 2500);
      } else {
        setAlbumSaveStatus("error");
      }
    } catch {
      setAlbumSaveStatus("error");
    }
  };

  const handleAlbumNameChange = (val: string) => {
    setAlbumName(val);
    const found = existingAlbums.find((a) => a.name.trim().toLowerCase() === val.trim().toLowerCase());
    if (found) {
      setArtStyle(found.art_style);
      if (found.description) setAlbumDescription(found.description);
      activeAlbumIdRef.current = found.id;
      setActiveAlbumId(found.id);
    } else if (activeAlbumIdRef.current) {
      patchAlbum({ name: val });
    }
  };

  const handleArtStyleChange = (val: ArtStyle) => {
    setArtStyle(val);
    if (activeAlbumIdRef.current) {
      patchAlbum({ artStyle: val });
    }
  };

  const handleAlbumDescriptionChange = (val: string) => {
    setAlbumDescription(val);
    if (activeAlbumIdRef.current) {
      patchAlbum({ description: val });
    }
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const uploadOne = async (draft: DraftItem, file: File) => {
    const body = new FormData();
    body.set("image", file);
    body.set("title", draft.title);
    body.set("category", draft.category);
    body.set("description", draft.description);
    body.set("altText", draft.altText);
    if (activeAlbumIdRef.current) {
      body.set("albumId", activeAlbumIdRef.current);
    } else if (albumName.trim()) {
      body.set("albumName", albumName.trim());
      if (artStyle) body.set("artStyle", artStyle);
      if (albumDescription.trim()) body.set("albumDescription", albumDescription.trim());
    }

    const res = await fetch("/api/design", { method: "POST", body });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      updateItem(draft.key, { uploading: false, error: (data && data.error) || "Đăng ảnh thất bại." });
      return;
    }
    if (data?.albumId) {
      activeAlbumIdRef.current = data.albumId;
      setActiveAlbumId(data.albumId);
    }
    updateItem(draft.key, { uploading: false, id: data.id, imageUrl: data.imageUrl });

    // Bù 1 PATCH ngay bằng state MỚI NHẤT
    setItems((prev) => {
      const latest = prev.find((it) => it.key === draft.key);
      if (latest) {
        fetch(`/api/design/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: latest.title,
            description: latest.description,
            category: latest.category,
            altText: latest.altText,
          }),
        }).catch(() => { });
      }
      return prev;
    });
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const trimmed = albumName.trim();
    if (trimmed && !matchedAlbum && !activeAlbumIdRef.current && !artStyle) {
      setFormError("Vui lòng chọn phong cách nghệ thuật cho album mới trước khi thêm ảnh.");
      return;
    }
    setFormError(null);

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setFormError(`"${file.name}" không phải ảnh — đã bỏ qua.`);
        continue;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        setFormError(`"${file.name}" vượt quá 8MB — đã bỏ qua.`);
        continue;
      }

      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const draft: DraftItem = {
        key,
        id: null,
        imageUrl: null,
        previewUrl: URL.createObjectURL(file),
        title: titleFromFilename(file.name),
        description: "",
        category: DESIGN_CATEGORIES[0].key,
        altText: "",
        uploading: true,
        error: null,
        shareToken: null,
        shareTokenPending: false,
      };
      setItems((prev) => [...prev, draft]);
      setSelectedKey((cur) => cur ?? key);

      compressImageFile(file).then((compressed) => uploadOne(draft, compressed));
    }
  };

  const selected = items.find((it) => it.key === selectedKey) ?? null;

  const patchSelected = (patch: Partial<Pick<DraftItem, "title" | "description" | "category" | "altText">>) => {
    if (!selected) return;
    updateItem(selected.key, patch);
    if (!selected.id) return; // chưa có id thật, chưa PATCH được — sẽ lưu khi upload xong
    fetch(`/api/design/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => { });
  };

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const deleteOne = async (key: string) => {
    const item = items.find((it) => it.key === key);
    setItems((prev) => prev.filter((it) => it.key !== key));
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setSelectedKey((cur) => (cur === key ? null : cur));
    if (item?.id) {
      await fetch("/api/design/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.id] }),
      }).catch(() => { });
    }
  };

  const deleteChecked = async () => {
    const ids = items.filter((it) => checkedKeys.has(it.key) && it.id).map((it) => it.id as string);
    setBulkDeletePending(true);
    if (ids.length > 0) {
      await fetch("/api/design/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => { });
    }
    setItems((prev) => prev.filter((it) => !checkedKeys.has(it.key)));
    setSelectedKey((cur) => (cur && checkedKeys.has(cur) ? null : cur));
    setCheckedKeys(new Set());
    setBulkDeletePending(false);
  };

  const shareUrlFor = (item: DraftItem) => `${origin}/lien-ket-thiet-ke?id=${item.id}&token=${item.shareToken}`;

  const createOrRegenerateLink = async () => {
    if (!selected?.id) return;
    updateItem(selected.key, { shareTokenPending: true });
    const res = await fetch(`/api/design/${selected.id}/share-token`, { method: "POST" });
    const data = await res.json().catch(() => null);
    updateItem(selected.key, {
      shareTokenPending: false,
      shareToken: res.ok ? data.shareToken : selected.shareToken,
    });
  };

  const copyLink = async (item: DraftItem) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(item));
      setCopiedKey(item.key);
      setTimeout(() => setCopiedKey((cur) => (cur === item.key ? null : cur)), 2000);
    } catch {
      // Clipboard không khả dụng — im lặng, người dùng vẫn thấy link để tự bôi đen/copy tay.
    }
  };

  const hasUploading = items.some((it) => it.uploading);

  // Ảnh chèn qua POST /api/design luôn ở trạng thái draft (published_at
  // NULL, xem migrations/archive/20260921_add_design_item_publish_state.sql) —
  // chỉ chính họa sĩ xem được, chưa hiện ở /thiet-ke. "Hoàn tất" phải gọi
  // /api/design/publish để công khai chúng TRƯỚC khi điều hướng đi, nếu
  // không ảnh sẽ mãi ở trạng thái draft không ai thấy được (kể cả chính
  // họa sĩ, ngoài trang quản lý riêng).
  const handleComplete = async () => {
    const ids = items.filter((it) => it.id).map((it) => it.id as string);
    if (ids.length === 0) {
      router.push("/thiet-ke");
      router.refresh();
      return;
    }
    setPublishing(true);
    const res = await fetch("/api/design/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setPublishing(false);
      setFormError((data && data.error) || "Đăng thiết kế thất bại.");
      return;
    }
    router.push("/thiet-ke");
    router.refresh();
  };

  return (
    <div className={className}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} className="hidden" />

      {formError && <Alert tone="error" className="mb-4">{formError}</Alert>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.1fr_260px]">
        {/* Cột trái — ảnh xem lại */}
        <div>
          {selected ? (
            <div className="overflow-hidden rounded-2xl border border-border-light bg-neutral-bg">
              <DisplayImage src={selected.imageUrl ?? selected.previewUrl} alt="" className="h-auto w-full object-cover" />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-border-light bg-neutral-bg py-16 text-center transition-colors hover:border-brand-gold"
            >
              <UploadSimpleIcon size={26} color="var(--color-brand-gold-dark)" />
              <span className="text-sm font-semibold text-brand-ink">Chọn ảnh tác phẩm</span>
              <span className="text-xs text-stone">JPG, PNG hoặc WEBP · tối đa 8MB/ảnh · chọn nhiều ảnh cùng lúc</span>
            </button>
          )}
        </div>

        {/* Cột giữa — thông tin ảnh đang chọn */}
        <div className="min-w-0">
          {selected ? (
            <div className="flex flex-col gap-4">
              <Field
                label="Tên tác phẩm"
                value={selected.title}
                onChange={(e) => patchSelected({ title: e.target.value })}
                placeholder="Nhập tên tác phẩm…"
              />

              <Textarea
                label="Mô tả"
                value={selected.description}
                onChange={(e) => patchSelected({ description: e.target.value })}
                rows={3}
                placeholder="Chất liệu, cảm hứng, hoặc bối cảnh sáng tác…"
              />

              <Select
                label="Loại sản phẩm"
                value={selected.category}
                onChange={(e) => patchSelected({ category: e.target.value as DesignItemCategory })}
              >
                {DESIGN_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>

              <Field
                label="Alt text"
                value={selected.altText}
                onChange={(e) => patchSelected({ altText: e.target.value })}
                placeholder="Mô tả ngắn cho người dùng máy đọc màn hình"
              />

              <div className="rounded-xl border border-border-light p-3.5">
                <button
                  type="button"
                  onClick={createOrRegenerateLink}
                  disabled={!selected.id || selected.shareTokenPending}
                  title={!selected.id ? "Đợi ảnh lưu xong để tạo link" : undefined}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-cream-border py-2.5 text-[12.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-50"
                >
                  <LinkSimpleIcon size={14} />
                  {selected.shareToken ? "Tạo lại link liên kết" : "Tạo link liên kết"}
                </button>
                {selected.shareToken && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <div className="min-w-0 flex-1 truncate rounded-lg bg-neutral-bg px-2.5 py-1.5 text-[11px] text-stone">
                      {shareUrlFor(selected)}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLink(selected)}
                      title="Sao chép link chia sẻ"
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-bg text-brand-ink transition-colors hover:bg-brand-gold"
                    >
                      {copiedKey === selected.key ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    </button>
                  </div>
                )}
                <p className="mt-2 text-[11.5px] leading-[1.5] text-stone">
                  Gửi link này cho tác giả để họ gắn ảnh làm bìa truyện, hoặc dán trên 1 dòng riêng trong nội dung
                  chương để hiển thị ảnh tại đó.
                </p>
              </div>

              {selected.error && (
                <Alert tone="error">{selected.error}</Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone">Chọn ảnh ở cột bên trái để bắt đầu điền thông tin.</p>
          )}
        </div>

        {/* Cột phải — album/phong cách chung + danh sách ảnh */}
        <div>
          <Field
            label="Tên album"
            list="design-album-names"
            value={albumName}
            onChange={(e) => handleAlbumNameChange(e.target.value)}
            placeholder="Đặt tên album…"
          />
          <datalist id="design-album-names">
            {existingAlbums.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>

          <Select
            label="Phong cách nghệ thuật"
            wrapperClassName="mt-3.5"
            value={matchedAlbum ? matchedAlbum.art_style : artStyle}
            onChange={(e) => handleArtStyleChange(e.target.value as ArtStyle)}
          >
            <option value="">— Chọn phong cách —</option>
            {ART_STYLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>

          <Textarea
            label="Mô tả album (tùy chọn)"
            wrapperClassName="mt-3.5"
            value={albumDescription}
            onChange={(e) => handleAlbumDescriptionChange(e.target.value)}
            rows={2}
            placeholder="Mô tả chung cho bộ sưu tập/album này…"
          />

          {items.length > 0 && albumName.trim() && (
            <div className="mt-2 text-[11.5px]">
              {albumSaveStatus === "saving" ? (
                <span className="flex items-center gap-1 font-medium text-brand-gold-dark">
                  <ArrowClockwiseIcon size={12} className="animate-spin" /> Đang cập nhật album…
                </span>
              ) : albumSaveStatus === "saved" ? (
                <span className="flex items-center gap-1 font-medium text-success-form">
                  <CheckIcon size={12} /> Đã cập nhật cho album
                </span>
              ) : (
                <span className="text-stone">
                  Thay đổi tên, phong cách và mô tả sẽ áp dụng cho tất cả {items.length} ảnh trong album này.
                </span>
              )}
            </div>
          )}

          <div className="mt-5 border-t border-border-light pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-brand-ink">Ảnh trong lượt đăng này</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer text-[12px] font-semibold text-brand-gold-dark"
              >
                + Thêm ảnh
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-[1.5] text-stone">
              Ảnh chỉ hiện công khai ở kho Thiết kế sau khi bạn bấm &quot;Hoàn tất&quot; bên dưới.
            </p>

            {checkedKeys.size > 0 && (
              <Button
                type="button"
                variant="danger-outline"
                size="sm"
                onClick={deleteChecked}
                disabled={bulkDeletePending}
                className="mt-2.5 gap-1.5 text-[12.5px] font-semibold"
              >
                <TrashIcon size={14} /> Xóa ({checkedKeys.size})
              </Button>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                  className={`relative flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition-colors ${item.key === selectedKey ? "border-brand-gold bg-cream-card" : "border-border-light"
                    }`}
                >
                  <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <Checkbox checked={checkedKeys.has(item.key)} onChange={() => toggleChecked(item.key)}>
                      <span className="sr-only">Chọn ảnh</span>
                    </Checkbox>
                  </span>
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-bg">
                    <DisplayImage src={item.imageUrl ?? item.previewUrl} displayWidth={320} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-ink">{item.title}</div>
                    <div className="text-[11px] text-stone">
                      {item.uploading ? "Đang lưu…" : item.error ? "Lỗi — bấm để xem" : "Đã lưu — chưa công khai"}
                    </div>
                  </div>
                  {item.uploading ? (
                    <ArrowClockwiseIcon size={14} className="shrink-0 animate-spin text-stone" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteOne(item.key);
                      }}
                      title="Xóa ảnh này"
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone transition-colors hover:bg-error-bg hover:text-error"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          type="button"
          fullWidth={false}
          disabled={items.length === 0 || hasUploading || publishing}
          onClick={handleComplete}
          className="rounded-full px-6 py-3.5 text-sm"
        >
          {publishing ? "Đang đăng…" : "Hoàn tất"}
        </Button>
      </div>
    </div>
  );
}
