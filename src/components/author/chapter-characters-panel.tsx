"use client";

import { useState } from "react";
import Link from "next/link";
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
      onTaggedChange?.(next.size);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSaving(false);
    }
  };

  // Trước đây trả null khi truyện chưa có nhân vật — tác giả không biết tính năng này tồn tại.
  if (bookCharacters.length === 0) {
    return (
      <p className="text-[12.5px] leading-relaxed text-stone-alt">
        Truyện chưa có nhân vật.{" "}
        <Link href={`/author/${bookId}`} className="font-semibold text-brand-gold-dark hover:text-brand-ink">
          Thêm nhân vật ở trang tác phẩm
        </Link>{" "}
        để gắn vào chương và cho độc giả bình chọn trope.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2.5 text-[12px] text-stone-alt">
        Chọn nhân vật xuất hiện trong chương — độc giả bình chọn trope trong số này. Tự lưu khi chọn.
      </p>
      <div className="flex flex-wrap gap-2">
        {bookCharacters.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={saving}
            onClick={() => toggle(c.id)}
            aria-pressed={tagged.has(c.id)}
            className={`min-h-9 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
              tagged.has(c.id)
                ? "border-brand-gold bg-brand-gold text-brand-ink"
                : "border-cream-border bg-white text-stone-dark"
            }`}
          >
            {c.name} <span className="font-normal opacity-70">· {ROLE_LABEL[c.role]}</span>
          </button>
        ))}
      </div>
      {error && <div className="mt-2.5 text-[12.5px] font-medium text-error">{error}</div>}
    </div>
  );
}
