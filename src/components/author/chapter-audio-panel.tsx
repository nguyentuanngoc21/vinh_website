"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MicrophoneIcon,
  LinkSimpleIcon,
  TrashIcon,
  SpeakerHighIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { formatDurationShort, type AudioTrack } from "@/lib/audio/get-audio-catalog";
import { readDurationSeconds } from "@/lib/audio/read-duration";

const AUDIO_MAX_BYTES = 60 * 1024 * 1024;

type ChapterAudioPanelProps = {
  chapterId: string;
  initialLinkedAudio: AudioTrack[];
};

/**
 * Quản lý audio gắn cho 1 chương — 2 luồng thật, đúng "Cách app dùng" ở
 * docs/supabase/schema.sql phần 9:
 *  1. "Tự thu và gắn" — tác giả tự upload, gắn ngay trong 1 lần bấm (POST
 *     .../audio/record, source: 'story_upload').
 *  2. "Dán link chia sẻ" — gắn bản thu của 1 diễn viên KHÁC, họ gửi link
 *     từ "Bản thu của tôi" ở /audio/new (POST .../audio/link, gọi
 *     link_audio_to_chapter() qua token).
 * Gỡ (DELETE .../audio/:audioNarrationId) không cần ai đồng ý — quyền của
 * tác giả với chương của chính họ.
 */
export function ChapterAudioPanel({ chapterId, initialLinkedAudio: linked }: ChapterAudioPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"record" | "link" | null>(null);
  const [pending, setPending] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Luồng "Tự thu và gắn"
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [title, setTitle] = useState("");

  // Luồng "Dán link"
  const [shareUrl, setShareUrl] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (!picked.type.startsWith("audio/")) {
      setError("Chỉ nhận file audio.");
      return;
    }
    if (picked.size > AUDIO_MAX_BYTES) {
      setError("File audio tối đa 60MB.");
      return;
    }
    setError(null);
    setFile(picked);
    setDurationSeconds(await readDurationSeconds(picked));
  };

  const submitRecord = async () => {
    if (!file) {
      setError("Vui lòng chọn file audio.");
      return;
    }
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("audio", file);
    if (title.trim()) body.set("title", title.trim());
    if (durationSeconds != null) body.set("durationSeconds", String(durationSeconds));

    const res = await fetch(`/api/authoring/chapters/${chapterId}/audio/record`, { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Gắn audio thất bại.");
      return;
    }
    setFile(null);
    setTitle("");
    setDurationSeconds(null);
    setMode(null);
    // router.refresh() (không phải window.location.reload()) — chỉ nạp
    // lại dữ liệu Server Component, KHÔNG xoá nội dung chương đang gõ dở
    // trong ChapterEditor (state đó nằm ở AuthorWorkspace, chỉ khởi tạo 1
    // lần từ props nên không bị reset khi props refetch).
    router.refresh();
  };

  const submitLink = async () => {
    if (!shareUrl.trim()) {
      setError("Vui lòng dán link chia sẻ.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/authoring/chapters/${chapterId}/audio/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareUrl: shareUrl.trim() }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Gắn audio thất bại.");
      return;
    }
    setShareUrl("");
    setMode(null);
    router.refresh();
  };

  const unlink = async (audioNarrationId: string) => {
    setUnlinkingId(audioNarrationId);
    const res = await fetch(`/api/authoring/chapters/${chapterId}/audio/${audioNarrationId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.refresh();
    } else {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="border-t border-cream-border p-[22px]">
      <div className="mb-3.5 text-xs font-bold tracking-wide text-stone-alt">AUDIO CHƯƠNG NÀY</div>

      {linked.length === 0 ? (
        <p className="mb-3.5 text-[13px] text-stone-alt">Chưa có giọng đọc nào được gắn.</p>
      ) : (
        <div className="mb-3.5 flex flex-col gap-2">
          {linked.map((t) => (
            <div
              key={t.id}
              style={{ opacity: unlinkingId === t.id ? 0.5 : 1 }}
              className="flex items-center gap-2.5 rounded-lg border border-cream-border px-3 py-2.5 transition-opacity"
            >
              <SpeakerHighIcon weight="fill" size={16} color="var(--color-brand-gold-dark)" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{t.title}</div>
                <div className="text-[11.5px] text-stone-alt">
                  {t.narratorName} · {formatDurationShort(t.durationSeconds)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => unlink(t.id)}
                disabled={unlinkingId === t.id}
                title="Gỡ khỏi chương này"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-alt transition-colors hover:bg-[#fdf1f1] hover:text-[#B02A37] disabled:cursor-default"
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-[#f3c6c6] bg-[#fdf1f1] px-3 py-2 text-[12px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}

      {mode === null && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("record")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-cream-border py-2.5 text-[12.5px] font-semibold text-brand-ink"
          >
            <MicrophoneIcon size={14} /> Tự thu & gắn
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-cream-border py-2.5 text-[12.5px] font-semibold text-brand-ink"
          >
            <LinkSimpleIcon size={14} /> Dán link
          </button>
        </div>
      )}

      {mode === "record" && (
        <div>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-cream-border py-6 text-center"
          >
            {file ? (
              <>
                <span className="max-w-full truncate px-3 text-[12.5px] font-semibold text-ink">{file.name}</span>
                <span className="text-[11px] text-stone-alt">{formatDurationShort(durationSeconds)}</span>
              </>
            ) : (
              <>
                <UploadSimpleIcon size={18} color="var(--color-brand-gold-dark)" />
                <span className="text-[12.5px] font-semibold text-ink">Chọn file audio</span>
              </>
            )}
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tên bản thu (tuỳ chọn)"
            className="mt-2.5 w-full rounded-lg border border-cream-border px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-gold"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={submitRecord}
              disabled={pending}
              className="flex-1 cursor-pointer rounded-[9px] bg-brand-gold py-2.5 text-[12.5px] font-bold text-brand-ink disabled:opacity-60"
            >
              {pending ? "Đang gắn…" : "Gắn vào chương"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setError(null);
              }}
              className="cursor-pointer rounded-[9px] border border-cream-border px-3 text-[12.5px] font-semibold text-stone-alt"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {mode === "link" && (
        <div>
          <input
            value={shareUrl}
            onChange={(e) => setShareUrl(e.target.value)}
            placeholder="Dán link chia sẻ (…?id=…&token=…)"
            className="w-full rounded-lg border border-cream-border px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-gold"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={submitLink}
              disabled={pending}
              className="flex-1 cursor-pointer rounded-[9px] bg-brand-gold py-2.5 text-[12.5px] font-bold text-brand-ink disabled:opacity-60"
            >
              {pending ? "Đang gắn…" : "Gắn vào chương"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setError(null);
              }}
              className="cursor-pointer rounded-[9px] border border-cream-border px-3 text-[12.5px] font-semibold text-stone-alt"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
