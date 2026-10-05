"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ManagedCharacter } from "@/components/author/character-manager";
import { CharacterForm, type CharacterDraft } from "./character-form";
import { ROLE_LABEL } from "@/lib/characters";

/**
 * "Nhân vật xuất hiện trong chương này" — checklist chọn từ danh sách
 * nhân vật đã tạo ở book-overview.tsx (CharacterManager). Lưu ngay khi
 * tick/bỏ tick (PUT thay toàn bộ tập, xem
 * src/app/api/authoring/chapters/[chapterId]/characters/route.ts) — cùng
 * tinh thần "tự lưu" của các trường khác trong publish-panel.tsx (genre,
 * tags…), không cần nút "Lưu" riêng.
 */
export function ChapterCharactersPanel({
  bookId,
  chapterId,
  bookCharacters,
  initialTaggedCharacterIds,
  onTaggedChange,
}: {
  bookId: string;
  chapterId: string;
  bookCharacters: ManagedCharacter[];
  initialTaggedCharacterIds: string[];
  /** Báo số nhân vật đã gắn cho publish-panel.tsx (dấu ✓ của mục). */
  onTaggedChange?: (count: number) => void;
}) {
  const [characters, setCharacters] = useState(bookCharacters);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const lock = useRef(false);
  const [tagged, setTagged] = useState<Set<string>>(new Set(initialTaggedCharacterIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (characterId: string) => {
    if (lock.current) return;
    lock.current = true;
    const next = new Set(tagged);
    if (next.has(characterId)) next.delete(characterId);
    else next.add(characterId);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/authoring/chapters/${chapterId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: [...next], expectedCharacterIds: [...tagged] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data?.characterIds)) {
          setTagged(new Set(data.characterIds));
          onTaggedChange?.(data.characterIds.length);
        }
        setError((data && typeof data.error === "string" && data.error) || "Lưu thất bại.");
        return;
      }
      setTagged(new Set(data.characterIds));
      onTaggedChange?.(data.characterIds.length);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const create = async (draft: CharacterDraft) => {
    if (lock.current) return false;
    lock.current = true; setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/characters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await res.json();
      if (!res.ok || !data.character) throw new Error(data.error || "Không tạo được nhân vật.");
      setCharacters(prev => [...prev, data.character]); setCreating(false); setSearch(""); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Không tạo được nhân vật."); return false; }
    finally { lock.current = false; setSaving(false); }
  };

  return (
    <div>
      <p className="mb-2.5 text-[12px] text-stone-alt">
        Chọn nhân vật xuất hiện trong chương — độc giả bình chọn trope trong số này. Tự lưu khi chọn.
      </p>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <button type="button" disabled={saving || creating} onClick={() => setCreating(true)} className="font-semibold text-brand-gold-dark disabled:opacity-50">Thêm nhân vật tại đây</button>
        <Link href={`/author/${bookId}`} className="underline">Quản lý hồ sơ</Link>
      </div>
      {creating && <div className="mb-3"><CharacterForm bookId={bookId} compact busy={saving} names={characters.map(c => c.name)} onSave={create} onCancel={() => setCreating(false)} /></div>}
      <label className="mb-3 block text-sm">Tìm nhân vật<input value={search} onChange={e => setSearch(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
      {!characters.length && <p className="mb-3 text-sm text-stone-alt">Truyện chưa có nhân vật. Thêm nhân vật để bắt đầu.</p>}
      <p role="status" className="mb-2 text-xs text-stone-alt">{saving ? "Đang lưu…" : `Đã gắn ${tagged.size} nhân vật`}</p>
      <div className="flex flex-wrap gap-2">
        {characters.filter(c => (!c.archived_at || tagged.has(c.id)) && `${c.name} ${c.aliases ?? ""}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi"))).map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={saving || creating}
            onClick={() => toggle(c.id)}
            aria-pressed={tagged.has(c.id)}
            className={`min-h-9 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
              tagged.has(c.id)
                ? "border-brand-gold bg-brand-gold text-brand-navy"
                : "border-cream-border bg-surface text-stone-dark"
            }`}
          >
            {c.name} <span className="font-normal opacity-70">· {ROLE_LABEL[c.role]}{c.archived_at ? " · Đã lưu trữ" : !c.is_public ? " · Riêng tư" : ""}</span>
          </button>
        ))}
      </div>
      {error && <div role="alert" className="mt-2.5 text-[12.5px] font-medium text-error">{error}</div>}
    </div>
  );
}
