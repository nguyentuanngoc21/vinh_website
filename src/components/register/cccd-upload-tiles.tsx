"use client";

import type { ChangeEvent } from "react";
import { CheckCircleIcon, IdentificationCardIcon } from "@phosphor-icons/react/dist/ssr";

export type CccdSlotKey = "front" | "back";

const SLOTS: { key: CccdSlotKey; title: string }[] = [
  { key: "front", title: "Mặt trước" },
  { key: "back", title: "Mặt sau" },
];

type CccdUploadTilesProps = {
  files: Record<CccdSlotKey, File | null>;
  onFile: (slot: CccdSlotKey) => (e: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * 2 ô chọn ảnh CCCD (mặt trước/mặt sau) — tách ra từ register-form.tsx để
 * dùng lại y hệt trong form cập nhật CCCD ở "Thông tin cá nhân"
 * (identity-form.tsx), tránh trùng lặp JSX.
 */
export function CccdUploadTiles({ files, onFile }: CccdUploadTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SLOTS.map((slot) => {
        const file = files[slot.key];
        return (
          <label
            key={slot.key}
            style={{
              borderColor: file ? "#2F7A4F" : "var(--color-border-light)",
              background: file ? "#F4FAF6" : "#fdfdfc",
            }}
            className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed p-[22px_16px] transition-colors hover:border-brand-gold hover:bg-[#FCFAF4]"
          >
            <input type="file" accept="image/*" onChange={onFile(slot.key)} className="hidden" />
            {file ? (
              <CheckCircleIcon weight="fill" size={26} color="#2F7A4F" />
            ) : (
              <IdentificationCardIcon size={26} color="var(--color-stone-light)" />
            )}
            <div className="mt-2.5 text-[13.5px] font-semibold text-slate">
              {file ? `${slot.title} · đã chọn` : slot.title}
            </div>
            <div className="mt-1 text-center text-xs text-stone-light">
              {file ? file.name : "Nhấn để chọn ảnh hoặc kéo vào đây"}
            </div>
          </label>
        );
      })}
    </div>
  );
}
