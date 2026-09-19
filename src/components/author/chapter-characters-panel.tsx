"use client";

import { useState } from "react";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import type { ManagedCharacter } from "@/components/author/character-manager";

const ROLE_LABEL: Record<ManagedCharacter["role"], string> = {
  hero: "Chính diện",
  villain: "Phản diện",
  neutral: "Trung lập",
};

/**
 * "Nhân vật xuất hiện trong chương này" — checklist chọn từ danh sách
 * nhân vật đã tạo ở book-overview.tsx (CharacterManager). Lưu ngay khi
 * tick/bỏ tick (PUT thay toàn bộ tập, xem
 * src/app/api/authoring/chapters/[chapterId]/characters/route.ts) — cùng
 * tinh thần "tự lưu" của các trường khác trong publish-panel.tsx (genre,
 * tags…), không cần nút "Lưu" riêng.
 */
export function ChapterCharactersPanel({
  chapterId,
  bookCharacters,
  initialTaggedCharacterIds,
}: {
  chapterId: string;
  bookCharacters: ManagedCharacter[];
  initialTaggedCharacterIds: string[];
}) {
  const [tagged, setTagged] = useState<Set<string>>(new Set(initialTaggedCharacterIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (characterId: string) => {
    if (saving) return;
    const next = new Set(tagged);
    if (next.has(characterId)) next.delete(characterId);
    else next.add(characterId);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/authoring/chapters/${chapterId}/characters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: [...next] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Lưu thất bại.");
        return;
      }
      setTagged(next);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSaving(false);
    }
  };

  if (bookCharacters.length === 0) return null;

  return (
    <div className="mt-5 rounded-[12px] border border-cream-border bg-white p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wide text-stone-alt">
        <UsersThreeIcon size={14} weight="bold" /> NHÂN VẬT TRONG CHƯƠNG NÀY
      </div>
      <div className="flex flex-wrap gap-2">
        {bookCharacters.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={saving}
            onClick={() => toggle(c.id)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
              tagged.has(c.id)
                ? "border-brand-gold bg-brand-gold text-brand-ink"
                : "border-cream-border bg-white text-stone-dark"
            }`}
          >
            {c.name} <span className="font-normal opacity-70">· {ROLE_LABEL[c.role]}</span>
          </button>
        ))}
      </div>
      {error && <div className="mt-2.5 text-[12.5px] font-medium text-[#B02A37]">{error}</div>}
    </div>
  );
}
