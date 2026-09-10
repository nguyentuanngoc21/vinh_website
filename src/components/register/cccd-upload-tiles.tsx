"use client";

import { useState, type ChangeEvent } from "react";
import { CheckCircleIcon, IdentificationCardIcon } from "@phosphor-icons/react/dist/ssr";
import { compressImageFile } from "@/lib/media/compress-image";

export type CccdSlotKey = "front" | "back";

const SLOTS: { key: CccdSlotKey; title: string }[] = [
  { key: "front", title: "Mặt trước" },
  { key: "back", title: "Mặt sau" },
];

type CccdUploadTilesProps = {
  files: Record<CccdSlotKey, File | null>;
  // Nhận thẳng File đã nén (không phải ChangeEvent) — việc đọc file từ
  // <input> và nén ảnh giờ nằm trong component này, xem compressImageFile()
  // và comment ở đó về lý do cần nén (sửa lỗi 413 Content Too Large).
  onFile: (slot: CccdSlotKey) => (file: File | null) => void;
};

/**
 * 2 ô chọn ảnh CCCD (mặt trước/mặt sau) — tách ra từ register-form.tsx để
 * dùng lại y hệt trong form cập nhật CCCD ở "Thông tin cá nhân"
 * (identity-form.tsx), tránh trùng lặp JSX.
 */
export function CccdUploadTiles({ files, onFile }: CccdUploadTilesProps) {
  // Nén ảnh có thể mất một nhịp (ảnh chụp gốc từ điện thoại thường vài MB)
  // — hiện trạng thái riêng từng ô để người dùng biết đang xử lý, không
  // tưởng app đứng hình khi bấm chọn ảnh xong không thấy gì đổi ngay.
  const [compressing, setCompressing] = useState<Record<CccdSlotKey, boolean>>({
    front: false,
    back: false,
  });

  const handleChange = (slot: CccdSlotKey) => async (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0] ?? null;
    if (!raw) {
      onFile(slot)(null);
      return;
    }
    setCompressing((prev) => ({ ...prev, [slot]: true }));
    const compressed = await compressImageFile(raw);
    setCompressing((prev) => ({ ...prev, [slot]: false }));
    onFile(slot)(compressed);
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SLOTS.map((slot) => {
        const file = files[slot.key];
        const isCompressing = compressing[slot.key];
        return (
          <label
            key={slot.key}
            style={{
              borderColor: file ? "#2F7A4F" : "var(--color-border-light)",
              background: file ? "#F4FAF6" : "#fdfdfc",
            }}
            className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed p-[22px_16px] transition-colors hover:border-brand-gold hover:bg-[#FCFAF4]"
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleChange(slot.key)}
              disabled={isCompressing}
              className="hidden"
            />
            {file ? (
              <CheckCircleIcon weight="fill" size={26} color="#2F7A4F" />
            ) : (
              <IdentificationCardIcon size={26} color="var(--color-stone-light)" />
            )}
            <div className="mt-2.5 text-[13.5px] font-semibold text-slate">
              {isCompressing ? `${slot.title} · đang xử lý…` : file ? `${slot.title} · đã chọn` : slot.title}
            </div>
            <div className="mt-1 text-center text-xs text-stone-light">
              {isCompressing
                ? "Đang nén ảnh, vui lòng đợi…"
                : file
                  ? file.name
                  : "Nhấn để chọn ảnh hoặc kéo vào đây"}
            </div>
          </label>
        );
      })}
    </div>
  );
}
