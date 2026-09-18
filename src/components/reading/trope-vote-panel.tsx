"use client";

import { useState } from "react";
import type { CharacterRole } from "@/lib/supabase/types";
import type { ThemeColors } from "./reader";

export type TropeCandidate = { id: string; name: string; role: CharacterRole; trope: string | null };

const ROLE_LABEL: Record<CharacterRole, string> = { hero: "Chính diện", villain: "Phản diện", neutral: "Trung lập" };

/**
 * "Bình chọn mẫu hình nhân vật yêu thích trong chương này" —
 * reader_vote_trope. Chỉ hiện khi chương có ít nhất 1 nhân vật đã gắn
 * (tác giả gắn qua chapter-characters-panel.tsx). 1 vote/chương, đổi ý
 * bấm nhân vật khác thì ghi đè (route tự UPDATE thay vì tạo vote mới).
 * Xem migrations/20260919_add_characters.sql.
 */
export function TropeVotePanel({
  chapterId,
  candidates,
  initialVotedCharacterId,
  c,
}: {
  chapterId: string;
  candidates: TropeCandidate[];
  initialVotedCharacterId: string | null;
  c: ThemeColors;
}) {
  const [votedId, setVotedId] = useState(initialVotedCharacterId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  const vote = async (characterId: string) => {
    if (pending || votedId === characterId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/trope-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Không thể ghi nhận bình chọn.");
        return;
      }
      setVotedId(characterId);
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ borderColor: c.hair }} className="mt-6 rounded-[12px] border p-4">
      <div style={{ color: c.inkSoft }} className="mb-2.5 text-xs font-bold tracking-wide">
        BẠN THÍCH MẪU HÌNH NHÂN VẬT NÀO TRONG CHƯƠNG NÀY?
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map((cand) => (
          <button
            key={cand.id}
            type="button"
            disabled={pending}
            onClick={() => vote(cand.id)}
            style={
              votedId === cand.id
                ? { background: "var(--color-brand-gold)", color: "var(--color-brand-ink)" }
                : { borderColor: c.hair, color: c.ink }
            }
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
              votedId === cand.id ? "" : "border"
            }`}
          >
            {cand.name}
            {cand.trope ? ` — ${cand.trope}` : ` (${ROLE_LABEL[cand.role]})`}
          </button>
        ))}
      </div>
      {error && <div className="mt-2 text-[12px] font-medium text-[#B02A37]">{error}</div>}
    </div>
  );
}
