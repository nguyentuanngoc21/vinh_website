"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { compressImageFile } from "@/lib/media/compress-image";

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Ảnh nền hiện phía sau chữ ở trang đọc, dưới lớp watermark tên tác giả và
 * một lớp phủ màu theo giao diện đọc (độc giả có thể tắt). Lưu ngay khi tải
 * lên/gỡ — không đi qua nút "Lưu nháp"/"Xuất bản".
 */
export function ChapterBackgroundPanel({ chapterId, bookSlug, chapterPublished, initialUrl, onChange }: {
  chapterId: string; bookSlug: string; chapterPublished: boolean; initialUrl: string | null;
  onChange?: (url: string | null) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  const send = async (method: "POST" | "DELETE", body?: FormData) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setStatus("");
    try {
      const res = await fetch(`/api/authoring/chapters/${chapterId}/background`, { method, body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Không lưu được ảnh nền.");
      setUrl(data.backgroundUrl ?? null);
      onChange?.(data.backgroundUrl ?? null);
      setStatus(method === "POST" ? "Đã lưu ảnh nền." : "Đã gỡ ảnh nền.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không kết nối được máy chủ."); }
    finally { lock.current = false; setBusy(false); }
  };

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) { setError("Chỉ nhận ảnh JPG, PNG hoặc WEBP."); return; }
    const form = new FormData();
    form.set("image", await compressImageFile(file));
    await send("POST", form);
  };

  return <div className="flex flex-col gap-3 text-sm">
    <p className="text-[13px] leading-[1.6] text-stone-alt">
      Ảnh hiện mờ phía sau chữ, dưới watermark tên tác giả. Ảnh được đánh dấu “không dùng để huấn luyện AI”.
      Độc giả có thể tắt ảnh nền trong phần cài đặt đọc.
    </p>
    {url && <div className="relative h-36 overflow-hidden rounded-lg border border-cream-border" aria-label="Xem trước ảnh nền">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* Cùng độ phủ với giao diện đọc nền kem (reader.tsx BACKGROUND_SCRIM). */}
      <div className="absolute inset-0 bg-cream-card-alt opacity-[.84]" />
      <p className="relative p-3 font-[family-name:var(--font-lora)] text-[15px] leading-[1.8] text-brand-ink">
        Gió từ vịnh thổi vào, mang theo mùi muối và một thứ im lặng rất cũ…
      </p>
    </div>}
    {error && <p role="alert" className="text-error">{error}</p>}
    <p role="status" className="text-stone-alt">{busy ? "Đang xử lý ảnh…" : status}</p>
    <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={e => pick(e.target.files?.[0])} />
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button size="sm" fullWidth={false} disabled={busy} onClick={() => input.current?.click()} className="min-h-11">
        {url ? "Đổi ảnh nền" : "Tải ảnh nền lên"}
      </Button>
      {url && <Button size="sm" variant="danger-outline" fullWidth={false} disabled={busy} onClick={() => send("DELETE")} className="min-h-11">
        Gỡ ảnh nền
      </Button>}
    </div>
    {url && chapterPublished && <Link href={`/read/${bookSlug}/${chapterId}`} target="_blank" className="min-h-9 font-semibold text-brand-gold-dark underline">
      Xem trên trang đọc
    </Link>}
  </div>;
}
