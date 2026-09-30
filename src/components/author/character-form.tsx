"use client";

import { useEffect, useState } from "react";
import { Field, Textarea } from "@/components/ui";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
import { createClient } from "@/lib/supabase/client";
import { compressImageFile } from "@/lib/media/compress-image";
import { ROLE_LABEL, STORY_ROLE_LABEL, type CharacterProfile, type StoryRole } from "@/lib/characters";
import type { CharacterRole } from "@/lib/supabase/types";

const EMPTY = { name: "", role: "neutral" as CharacterRole, trope: "", aliases: "", avatar_url: "", description: "", private_notes: "", story_role: "supporting" as StoryRole, is_public: false, show_role: true };
export type CharacterDraft = typeof EMPTY;
const AVATAR_MAX_BYTES = 15 * 1024 * 1024;
export function CharacterForm({ bookId, initial, names, busy, onSave, onCancel, compact = false }: {
  bookId: string; initial?: CharacterProfile; names: string[]; busy: boolean; compact?: boolean;
  onSave: (draft: CharacterDraft) => Promise<boolean>; onCancel?: () => void;
}) {
  const initialDraft: CharacterDraft = initial ? { name: initial.name, role: initial.role, trope: initial.trope ?? "", aliases: initial.aliases ?? "", avatar_url: initial.avatar_url ?? "", description: initial.description ?? "", private_notes: initial.private_notes ?? "", story_role: initial.story_role, is_public: initial.is_public, show_role: initial.show_role } : EMPTY;
  const [draft, setDraft] = useState(initialDraft);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const closeCrop = () => { if (cropSrc) URL.revokeObjectURL(cropSrc); setCropSrc(null); };
  const pickAvatar = (file: File | undefined) => {
    setUploadError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setUploadError("Chỉ nhận ảnh JPG, PNG hoặc WEBP."); return; }
    if (file.size > AVATAR_MAX_BYTES) { setUploadError("Ảnh tối đa 15MB."); return; }
    setCropSrc(URL.createObjectURL(file));
  };
  // Signed URL -> direct upload to Storage; the public URL is saved with the form.
  const uploadAvatar = async (cropped: File) => {
    closeCrop(); setUploading(true); setUploadError(null);
    try {
      const file = await compressImageFile(cropped);
      const res = await fetch(`/api/authoring/books/${bookId}/characters/avatar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error || "Không tải được ảnh.");
      const { error } = await createClient().storage.from("avatars").uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
      if (error) throw new Error("Không tải được ảnh. Vui lòng thử lại.");
      setDraft(d => ({ ...d, avatar_url: data.publicUrl }));
    } catch (e) { setUploadError(e instanceof Error ? e.message : "Không tải được ảnh."); }
    finally { setUploading(false); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const duplicate = names.some(n => n.trim().toLocaleLowerCase("vi") === draft.name.trim().toLocaleLowerCase("vi"));
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]") || event.defaultPrevented) return;
      if (!window.confirm("Bạn có thay đổi nhân vật chưa lưu. Rời trang và bỏ thay đổi?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeNavigate, true); };
  }, [dirty]);
  const field = (key: "name" | "trope" | "aliases" | "avatar_url", label: string, max: number) => (
    <Field label={label} aria-label={label} value={draft[key]} maxLength={max} required={key === "name"} type={key === "avatar_url" ? "url" : "text"}
      hint={`${draft[key].length}/${max}`} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
  );
  return <><form onSubmit={async e => { e.preventDefault(); if (!busy && await onSave(draft)) setDraft(EMPTY); }} className="rounded-xl border border-cream-border bg-cream-card p-4">
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3 disabled:opacity-60">
      <legend className="mb-3 font-semibold">{initial ? `Sửa ${initial.name}` : "Thêm nhân vật"}</legend>
      {field("name", "Tên nhân vật", 60)}
      {duplicate && <p role="status" className="text-sm text-brand-gold-dark">Đã có nhân vật cùng tên trong truyện. Bạn vẫn có thể lưu nếu đây là chủ ý.</p>}
      <label className="text-sm">Vai trò trong truyện<select aria-label="Vai trò trong truyện" className="mt-1 block w-full rounded-lg border bg-white p-2" value={draft.story_role} onChange={e => setDraft(d => ({ ...d, story_role: e.target.value as StoryRole }))}>
        {Object.entries(STORY_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <fieldset><legend className="mb-2 text-sm">Chính/phản diện</legend><div className="flex flex-wrap gap-3">
        {Object.entries(ROLE_LABEL).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-sm"><input type="radio" name={`role-${initial?.id ?? "new"}`} checked={draft.role === k} onChange={() => setDraft(d => ({ ...d, role: k as CharacterRole }))} />{v}</label>)}
      </div></fieldset>
      {field("trope", "Mẫu hình (không bắt buộc)", 40)}
      {!compact && <>
        {field("aliases", "Biệt danh / tên gọi khác", 200)}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Ảnh đại diện</span>
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.avatar_url ? <img src={draft.avatar_url} alt="Ảnh đại diện hiện tại" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
              : <span aria-hidden className="h-16 w-16 rounded-full border border-dashed border-cream-border" />}
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? "Đang tải ảnh…" : draft.avatar_url ? "Đổi ảnh" : "Tải ảnh lên"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
                onChange={e => { pickAvatar(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {draft.avatar_url && <button type="button" disabled={uploading} onClick={() => setDraft(d => ({ ...d, avatar_url: "" }))} className="min-h-11 px-2 text-sm underline disabled:opacity-50">Gỡ ảnh</button>}
          </div>
          {uploadError && <p role="alert" className="text-sm text-error">{uploadError}</p>}
          {field("avatar_url", "Hoặc dán URL ảnh (HTTPS)", 2048)}
        </div>
        <Textarea label="Mô tả công khai" value={draft.description} maxLength={2000} hint={`${draft.description.length}/2000`} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
        <Textarea label="Ghi chú riêng — chỉ bạn xem được" value={draft.private_notes} maxLength={5000} hint={`${draft.private_notes.length}/5000`} onChange={e => setDraft(d => ({ ...d, private_notes: e.target.value }))} />
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_public} onChange={e => setDraft(d => ({ ...d, is_public: e.target.checked }))} />Công khai cho độc giả khi truyện đã xuất bản</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.show_role} onChange={e => setDraft(d => ({ ...d, show_role: e.target.checked }))} />Hiển thị chính/phản diện cho độc giả</label>
      <p className="text-xs text-stone-alt">Nhân vật riêng tư vẫn gắn được vào chương; độc giả chỉ theo dõi/bình chọn nhân vật công khai.</p>
      <div className="flex gap-3">
        <button type="submit" disabled={busy || uploading || !draft.name.trim()} className="rounded-lg bg-brand-gold px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Thêm nhân vật"}</button>
        {onCancel && <button type="button" onClick={() => { if (!dirty || window.confirm("Bỏ thay đổi nhân vật chưa lưu?")) onCancel(); }} className="rounded-lg border px-4 py-2">Huỷ</button>}
      </div>
    </fieldset>
  </form>
    {cropSrc && <ImageCropModal key={cropSrc} open imageSrc={cropSrc} aspect={1} cropShape="round" title="Cắt ảnh nhân vật"
      outputFileName="character" onCancel={closeCrop} onConfirm={uploadAvatar} />}
  </>;
}
