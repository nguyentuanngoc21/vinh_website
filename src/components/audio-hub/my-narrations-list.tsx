"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDurationShort } from "@/lib/audio/get-audio-catalog";
import { useOrigin } from "@/lib/use-origin";

export type MyNarration = {
  id: string;
  title: string;
  genre: string | null;
  durationSeconds: number | null;
  shareToken: string;
  createdAt: string;
};

/**
 * "Bản thu của tôi" — danh sách audio_narrations THẬT của chính người
 * đang xem (base table, không phải view — RLS "narrators view their own
 * audio narrations (incl. share token)" cho phép chủ sở hữu thấy cả
 * share_token, xem src/app/audio/new/page.tsx). Mỗi dòng có link chia sẻ
 * dạng "?id=...&token=..." — tác giả dán link này vào ô "Gắn giọng đọc"
 * trong trang soạn chương của họ để gọi link_audio_to_chapter(). "Tạo lại
 * link" gọi RPC regenerate_audio_share_token — link cũ hết hiệu lực để
 * gắn thêm (các liên kết ĐÃ tạo trước đó không bị gỡ), giống nút "Get new
 * link" của Google Drive.
 */
export function MyNarrationsList({ narrations }: { narrations: MyNarration[] }) {
  const [tokens, setTokens] = useState<Record<string, string>>(() =>
    Object.fromEntries(narrations.map((n) => [n.id, n.shareToken]))
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState<Record<string, boolean>>({});
  const origin = useOrigin();

  if (narrations.length === 0) return null;

  const shareUrlFor = (id: string) => `${origin}/lien-ket-audio?id=${id}&token=${tokens[id]}`;

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      // Clipboard không khả dụng (http không an toàn, quyền bị chặn...) —
      // im lặng bỏ qua, người dùng vẫn thấy link để tự bôi đen/copy tay.
    }
  };

  const regenerate = async (id: string) => {
    setRegenPending((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/audio/${id}/share-token`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.shareToken) {
        setTokens((prev) => ({ ...prev, [id]: data.shareToken }));
      }
    } finally {
      setRegenPending((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="mt-10">
      <div className="text-[13px] font-semibold text-brand-ink">Bản thu của tôi</div>
      <p className="mt-1 text-xs text-stone">
        Gửi link chia sẻ cho tác giả để họ gắn bản thu vào 1 chương — họ dán
        link này vào trang soạn chương của họ.
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {narrations.map((n) => (
          <div key={n.id} className="rounded-xl border border-[#e2ded7] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{n.title}</div>
                <div className="mt-0.5 text-xs text-stone">
                  {n.genre ?? "Chưa phân loại"} · {formatDurationShort(n.durationSeconds)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copyLink(n.id)}
                  title="Sao chép link chia sẻ"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-neutral-bg text-brand-ink transition-colors hover:bg-brand-gold"
                >
                  {copiedId === n.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => regenerate(n.id)}
                  disabled={regenPending[n.id]}
                  title="Tạo lại link (link cũ hết hiệu lực để gắn thêm)"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-neutral-bg text-brand-ink transition-colors hover:bg-brand-gold disabled:cursor-default disabled:opacity-50"
                >
                  <ArrowClockwiseIcon size={15} />
                </button>
              </div>
            </div>
            <div className="mt-2 truncate rounded-lg bg-neutral-bg px-2.5 py-1.5 text-[11px] text-stone">
              {shareUrlFor(n.id)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
