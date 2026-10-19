"use client";

import Image from "next/image";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { CONTEST_IMAGE_BUCKET, CONTEST_IMAGE_MAX_BYTES, CONTEST_IMAGE_TYPES } from "@/lib/contests/image-upload";

export function ContestImageField({ label, hint, value, onChange, disabled, onBusyChange }: {
  label: string; hint: string; value: string; onChange: (url: string) => void;
  disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (!Object.hasOwn(CONTEST_IMAGE_TYPES, file.type) || file.size <= 0 || file.size > CONTEST_IMAGE_MAX_BYTES) {
      setError("Chỉ nhận JPG, PNG, WebP tối đa 10 MB.");
      return;
    }
    setUploading(true);
    onBusyChange(true);
    try {
      const response = await fetch("/api/admin/contests/image-upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Không tải được ảnh.");
      const { error } = await createClient().storage.from(CONTEST_IMAGE_BUCKET)
        .uploadToSignedUrl(result.path, result.token, file, { contentType: file.type });
      if (error) throw new Error("Không tải được ảnh. Vui lòng thử lại.");
      onChange(result.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không tải được ảnh.");
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }

  return <div className="flex flex-col gap-3">
    <Field label={`${label} (URL)`} hint={hint} value={value} disabled={disabled || uploading} onChange={(e) => onChange(e.target.value)} />
    <Field label={`Hoặc tải ${label.toLowerCase()} từ máy tính`} type="file" accept="image/jpeg,image/png,image/webp"
      hint="JPG, PNG, WebP · tối đa 10 MB. Tải xong, bấm lưu cuộc thi để áp dụng."
      disabled={disabled || uploading} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void upload(file);
      }} />
    {uploading && <p role="status" className="text-sm text-stone">Đang tải ảnh…</p>}
    {error && <Alert tone="error">{error}</Alert>}
    {/^https?:\/\//i.test(value) && <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-bg">
      <Image src={value} alt={`Xem trước ${label.toLowerCase()}`} fill unoptimized className="object-contain" />
    </div>}
    {value && <button type="button" disabled={disabled || uploading} className="self-start text-sm text-error disabled:opacity-50" onClick={() => onChange("")}>Bỏ ảnh</button>}
  </div>;
}
