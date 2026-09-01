"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSimpleIcon, WaveformIcon } from "@phosphor-icons/react/dist/ssr";
import { AUDIO_GENRES, formatDurationShort } from "@/lib/audio/get-audio-catalog";
import { readDurationSeconds } from "@/lib/audio/read-duration";

const AUDIO_MAX_BYTES = 60 * 1024 * 1024;

export function AudioUploadForm({ className }: { className?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<(typeof AUDIO_GENRES)[number]>(AUDIO_GENRES[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Vui lòng chọn file audio.");
      return;
    }
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề.");
      return;
    }

    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("audio", file);
    body.set("title", title.trim());
    body.set("genre", genre);
    if (durationSeconds != null) body.set("durationSeconds", String(durationSeconds));

    const res = await fetch("/api/audio", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Đăng bản thu thất bại.");
      return;
    }
    router.push("/audio");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-[#e2ded7] bg-neutral-bg py-10 text-center transition-colors hover:border-brand-gold"
      >
        {file ? (
          <>
            <WaveformIcon size={26} color="var(--color-brand-gold-dark)" />
            <span className="max-w-full truncate px-4 text-sm font-semibold text-brand-ink">{file.name}</span>
            <span className="text-xs text-stone">{formatDurationShort(durationSeconds)}</span>
          </>
        ) : (
          <>
            <UploadSimpleIcon size={26} color="var(--color-brand-gold-dark)" />
            <span className="text-sm font-semibold text-brand-ink">Chọn file audio</span>
            <span className="text-xs text-stone">MP3, M4A, WAV hoặc OGG · tối đa 60MB</span>
          </>
        )}
      </button>

      <label className="mt-6 block text-[13px] font-semibold text-brand-ink">Tiêu đề</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ví dụ: Vũng Vịnh Cuối Trời — Chương 1"
        className="mt-1.5 w-full rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
      />

      <label className="mt-5 block text-[13px] font-semibold text-brand-ink">Thể loại</label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {AUDIO_GENRES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(g)}
            className={`cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              g === genre ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-[#FDECEC] px-3.5 py-2.5 text-[13px] font-medium text-[#B02A37]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full cursor-pointer rounded-full bg-brand-gold px-6 py-3.5 text-sm font-bold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
      >
        {pending ? "Đang đăng…" : "Đăng bản thu"}
      </button>
    </form>
  );
}
