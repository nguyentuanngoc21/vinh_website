"use client";

import { useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { Field } from "@/components/ui";
import type { CharacterRole } from "@/lib/supabase/types";

export type ManagedCharacter = {
  id: string;
  name: string;
  role: CharacterRole;
  trope: string | null;
};

const ROLE_LABEL: Record<CharacterRole, string> = { hero: "Chính diện", villain: "Phản diện", neutral: "Trung lập" };
const ROLE_STYLE: Record<CharacterRole, string> = {
  hero: "bg-[#E4F1EA] text-[#256B4C]",
  villain: "bg-[#FBEAEA] text-[#B02A37]",
  neutral: "bg-cream-card-alt text-stone-dark",
};
const ROLES: CharacterRole[] = ["hero", "villain", "neutral"];

type Draft = { name: string; role: CharacterRole; trope: string };
const EMPTY_DRAFT: Draft = { name: "", role: "neutral", trope: "" };

/**
 * Quản lý nhân vật của 1 sách — công cụ THẬT cho tác giả (không chỉ để mở
 * khoá quest/thành tựu, xem migrations/20260919_add_characters.sql). Nối
 * vào book-overview.tsx. role phân loại rộng (chính diện/phản diện/trung
 * lập); trope là free-text tự do (vd "Ma vương", "Trượng nghĩa") — độc
 * giả gắn nhân vật vào từng chương ở chapter-characters-panel.tsx, follow
 * + bình chọn ở phía đọc.
 */
export function CharacterManager({ bookId, initialCharacters }: { bookId: string; initialCharacters: ManagedCharacter[] }) {
  const [characters, setCharacters] = useState<ManagedCharacter[]>(initialCharacters);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const name = draft.name.trim();
    if (!name || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role: draft.role, trope: draft.trope.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.character) {
        setError((data && typeof data.error === "string" && data.error) || "Không tạo được nhân vật.");
        return;
      }
      setCharacters((prev) => [...prev, data.character]);
      setDraft(EMPTY_DRAFT);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: ManagedCharacter) => {
    setEditingId(c.id);
    setEditDraft({ name: c.name, role: c.role, trope: c.trope ?? "" });
  };

  const saveEdit = async (characterId: string) => {
    const name = editDraft.name.trim();
    if (!name || savingId) return;
    setSavingId(characterId);
    setError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role: editDraft.role, trope: editDraft.trope.trim() || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.character) {
        setError((data && typeof data.error === "string" && data.error) || "Lưu thất bại.");
        return;
      }
      setCharacters((prev) => prev.map((c) => (c.id === characterId ? data.character : c)));
      setEditingId(null);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (characterId: string) => {
    if (deletingId) return;
    if (!window.confirm("Xoá nhân vật này? Sẽ gỡ khỏi mọi chương đã gắn.")) return;
    setDeletingId(characterId);
    setError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/characters/${characterId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Xoá thất bại.");
        return;
      }
      setCharacters((prev) => prev.filter((c) => c.id !== characterId));
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setDeletingId(null);
    }
  };

  const roleButtons = (value: CharacterRole, onChange: (r: CharacterRole) => void) => (
    <div className="flex gap-1.5">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            value === r ? ROLE_STYLE[r] : "bg-cream-card text-stone-alt"
          }`}
        >
          {ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mb-6 rounded-[12px] border border-cream-border bg-white p-5">
      <div className="mb-3.5 flex items-center gap-2 text-xs font-bold tracking-wide text-stone-alt">
        <UsersThreeIcon size={14} weight="bold" /> NHÂN VẬT
      </div>

      {characters.length === 0 && !editingId && (
        <p className="mb-3 text-[13px] italic text-stone-light">
          Chưa có nhân vật nào — thêm để độc giả có thể theo dõi/bình chọn, và gắn vào từng chương.
        </p>
      )}

      <div className="mb-3 flex flex-col gap-2">
        {characters.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="flex flex-col gap-2 rounded-[10px] border border-brand-gold/60 bg-cream-card p-3">
              <Field
                label={null}
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Tên nhân vật"
              />
              {roleButtons(editDraft.role, (role) => setEditDraft((d) => ({ ...d, role })))}
              <Field
                label={null}
                value={editDraft.trope}
                onChange={(e) => setEditDraft((d) => ({ ...d, trope: e.target.value }))}
                placeholder="Mẫu hình (vd: Ma vương, Trượng nghĩa…) — không bắt buộc"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingId === c.id}
                  onClick={() => saveEdit(c.id)}
                  className="rounded-[9px] bg-brand-gold px-4 py-2 text-[13px] font-bold text-brand-ink disabled:opacity-60"
                >
                  {savingId === c.id ? "Đang lưu…" : "Lưu"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-[9px] border border-cream-border bg-white px-4 py-2 text-[13px] font-semibold text-brand-ink"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-cream-border px-3.5 py-2.5"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold text-brand-ink">{c.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[c.role]}`}>
                  {ROLE_LABEL[c.role]}
                </span>
                {c.trope && <span className="text-[12px] text-stone-alt">· {c.trope}</span>}
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="flex items-center gap-1 text-[12px] font-semibold text-brand-gold-dark hover:text-brand-ink"
                >
                  <PencilSimpleIcon size={13} weight="bold" /> Sửa
                </button>
                <button
                  type="button"
                  disabled={deletingId === c.id}
                  onClick={() => remove(c.id)}
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#B02A37] disabled:opacity-50"
                >
                  <TrashIcon size={13} /> Xoá
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2 text-[12.5px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-cream-border p-3">
        <Field
          label={null}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Tên nhân vật mới"
        />
        {roleButtons(draft.role, (role) => setDraft((d) => ({ ...d, role })))}
        <Field
          label={null}
          value={draft.trope}
          onChange={(e) => setDraft((d) => ({ ...d, trope: e.target.value }))}
          placeholder="Mẫu hình (vd: Ma vương, Trượng nghĩa…) — không bắt buộc"
        />
        <button
          type="button"
          disabled={adding || !draft.name.trim()}
          onClick={create}
          className="flex w-fit items-center gap-1.5 rounded-[9px] bg-brand-gold px-4 py-2 text-[13px] font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
        >
          <PlusIcon size={14} weight="fill" /> {adding ? "Đang thêm…" : "Thêm nhân vật"}
        </button>
      </div>
    </div>
  );
}
