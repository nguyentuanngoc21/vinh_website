"use client";

import { useState } from "react";
import {
  ShieldCheckIcon,
  FingerprintIcon,
  ImageSquareIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/dist/ssr";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: on ? "#3B9B6F" : "rgba(255,255,255,.18)" }}
      className="h-[23px] w-10 shrink-0 cursor-pointer rounded-full p-[3px] transition-colors"
    >
      <div
        style={{ transform: `translateX(${on ? "17px" : "0px"})` }}
        className="h-[17px] w-[17px] rounded-full bg-white transition-transform"
      />
    </div>
  );
}

export function CopyrightSettings() {
  const [wm, setWm] = useState(true);
  const [img, setImg] = useState(true);
  const [nft, setNft] = useState(true);

  return (
    <div className="rounded-[14px] bg-brand-ink-dark px-[18px] pb-5 pt-[18px] text-sidebar-text">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheckIcon weight="fill" size={18} color="var(--color-brand-gold-light)" />
        <div className="text-sm font-bold text-white">Bảo vệ bản quyền</div>
      </div>
      <div className="mb-4 text-xs leading-relaxed text-sidebar-text-dim">
        Áp dụng cho chương này khi xuất bản.
      </div>

      <div className="flex items-center gap-3 border-t border-white/8 py-[11px]">
        <FingerprintIcon size={20} color="var(--color-brand-gold-light)" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white">
            Watermark động
          </div>
          <div className="text-[11px] text-sidebar-text-dim">
            Tên + ID người đọc trên nền
          </div>
        </div>
        <Toggle on={wm} onClick={() => setWm((v) => !v)} />
      </div>

      <div className="flex items-center gap-3 border-t border-white/8 py-[11px]">
        <ImageSquareIcon size={20} color="var(--color-brand-gold-light)" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white">
            Render dạng ảnh
          </div>
          <div className="text-[11px] text-sidebar-text-dim">
            Chống bôi đen sao chép
          </div>
        </div>
        <Toggle on={img} onClick={() => setImg((v) => !v)} />
      </div>

      <div className="flex items-center gap-3 border-t border-white/8 py-[11px] pb-3.5">
        <SealCheckIcon size={20} color="var(--color-brand-gold-light)" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-white">
            Chứng nhận NFT
          </div>
          <div className="text-[11px] text-sidebar-text-dim">
            {nft
              ? "Đúc token sở hữu trên blockchain"
              : "Tắt — không đúc token"}
          </div>
        </div>
        <Toggle on={nft} onClick={() => setNft((v) => !v)} />
      </div>

      {nft && (
        <div className="flex items-center gap-[11px] rounded-[10px] border border-brand-gold-light/30 bg-brand-gold-light/12 p-3">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-brand-gold-light text-[11px] font-bold text-brand-ink-dark">
            NFT
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white">
              Sẽ đúc khi xuất bản
            </div>
            <div className="truncate text-[11px] text-sidebar-text-dim">
              Token #VIN-0142 · Polygon
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
