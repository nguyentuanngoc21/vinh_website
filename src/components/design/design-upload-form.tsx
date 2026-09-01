"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import type { DesignItemCategory } from "@/lib/supabase/types";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function DesignUploadForm({ className }: { className?: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DesignItemCategory>("bia_truyen");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setError("Chỉ nhận file ảnh.");
      return;
    }
    if (picked.size > IMAGE_MAX_BYTES) {
      setError("Ảnh tối đa 8MB.");
      return;
    }
    setError(null);
    setFile(picked);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Vui lòng chọn ảnh tác phẩm.");
      return;
    }
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề tác phẩm.");
      return;
    }

    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("image", file);
    body.set("title", title.trim());
    body.set("description", description.trim());
    body.set("category", category);

    const res = await fetch("/api/design", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Đăng tác phẩm thất bại.");
      return;
    }
    router.push("/thiet-ke");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border-2 border-dashed border-[#e2ded7] bg-neutral-bg py-10 text-center transition-colors hover:border-brand-gold"
        style={previewUrl ? { padding: 0, border: "none" } : undefined}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="max-h-[360px] w-full object-cover" />
        ) : (
          <>
            <UploadSimpleIcon size={26} color="var(--color-brand-gold-dark)" />
            <span className="text-sm font-semibold text-brand-ink">Chọn ảnh tác phẩm</span>
            <span className="text-xs text-stone">JPG, PNG hoặc WEBP · tối đa 8MB</span>
          </>
        )}
      </button>

      <label className="mt-6 block text-[13px] font-semibold text-brand-ink">Tiêu đề</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ví dụ: Bìa tái bản — Vũng Vịnh Cuối Trời"
        className="mt-1.5 w-full rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
      />

      <label className="mt-5 block text-[13px] font-semibold text-brand-ink">Thể loại</label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {DESIGN_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              c.key === category ? "bg-brand-ink text-white" : "bg-neutral-bg text-[#3a3a3a]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-[13px] font-semibold text-brand-ink">Mô tả (tuỳ chọn)</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Chất liệu, cảm hứng, hoặc bối cảnh sáng tác…"
        className="mt-1.5 w-full resize-none rounded-xl border border-[#e2ded7] px-4 py-3 text-sm text-ink outline-none focus:border-brand-gold"
      />

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
        {pending ? "Đang đăng…" : "Đăng tác phẩm"}
      </button>
    </form>
  );
}
