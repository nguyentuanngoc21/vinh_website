"use client";

import { useState } from "react";
import { HeartIcon } from "@phosphor-icons/react/dist/ssr";
import type { CharacterRole } from "@/lib/supabase/types";

export type StoryCharacter = {
  id: string;
  name: string;
  role: CharacterRole;
  trope: string | null;
  followedByViewer: boolean;
};

const ROLE_LABEL: Record<CharacterRole, string> = { hero: "Chính diện", villain: "Phản diện", neutral: "Trung lập" };
const ROLE_STYLE: Record<CharacterRole, string> = {
  hero: "bg-[#E4F1EA] text-[#256B4C]",
  villain: "bg-[#FBEAEA] text-[#B02A37]",
  neutral: "bg-cream-card-alt text-stone-dark",
};

/**
 * Danh sách nhân vật của 1 truyện — tab "Nhân vật" ở trang giới thiệu
 * (story-tabs.tsx). Follow toggle mirror handleToggleFollow trong
 * reader.tsx (author follow) — optimistic, rollback nếu lỗi/401. Xem
 * migrations/20260919_add_characters.sql.
 */
export function CharacterList({ characters: initial }: { characters: StoryCharacter[] }) {
  const [characters, setCharacters] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggleFollow = async (characterId: string) => {
    if (pendingId) return;
    setPendingId(characterId);
    const prev = characters.find((c) => c.id === characterId)?.followedByViewer ?? false;
    setCharacters((cs) => cs.map((c) => (c.id === characterId ? { ...c, followedByViewer: !prev } : c)));
    try {
      const res = await fetch(`/api/characters/${characterId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      const resolved = res.ok && data ? !!data.following : prev;
      setCharacters((cs) => cs.map((c) => (c.id === characterId ? { ...c, followedByViewer: resolved } : c)));
    } catch {
      setCharacters((cs) => cs.map((c) => (c.id === characterId ? { ...c, followedByViewer: prev } : c)));
    } finally {
      setPendingId(null);
    }
  };

  if (characters.length === 0) {
    return <p className="text-[13.5px] italic text-stone-light">Truyện này chưa có nhân vật nào được gắn.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {characters.map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-light px-3.5 py-2.5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-brand-ink">{c.name}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[c.role]}`}>
              {ROLE_LABEL[c.role]}
            </span>
            {c.trope && <span className="text-[12px] text-stone-alt">· {c.trope}</span>}
          </div>
          <button
            type="button"
            disabled={pendingId === c.id}
            onClick={() => toggleFollow(c.id)}
            style={{
              background: c.followedByViewer ? "var(--color-brand-ink)" : "var(--color-brand-gold)",
              color: c.followedByViewer ? "#fff" : "var(--color-brand-ink)",
            }}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-60"
          >
            <HeartIcon size={13} weight="fill" /> {c.followedByViewer ? "Đã theo dõi" : "Theo dõi"}
          </button>
        </div>
      ))}
    </div>
  );
}
