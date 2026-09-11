"use client";

import { useState } from "react";
import {
  CaretDownIcon,
  FingerprintIcon,
  ImageSquareIcon,
  SealCheckIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{ background: on ? "#3B9B6F" : "rgba(255,255,255,.18)" }}
      className="h-[23px] w-10 shrink-0 cursor-pointer rounded-full p-[3px] transition-colors"
    >
      <span
        style={{ transform: `translateX(${on ? "17px" : "0px"})` }}
        className="block h-[17px] w-[17px] rounded-full bg-white transition-transform"
      />
    </button>
  );
}

export function CopyrightSettings() {
  const [expanded, setExpanded] = useState(false);
  const [wm, setWm] = useState(true);
  const [img, setImg] = useState(true);
  const [nft, setNft] = useState(true);
  const enabledCount = [wm, img, nft].filter(Boolean).length;

  return (
    <div className="rounded-[14px] bg-brand-ink-dark px-[18px] py-[16px] text-sidebar-text">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-3 text-left"
      >
        <ShieldCheckIcon
          weight="fill"
          size={19}
          color="var(--color-brand-gold-light)"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">Bảo vệ bản quyền</div>
          <div className="mt-1 text-xs leading-relaxed text-sidebar-text-dim">
            {enabledCount}/3 lớp bảo vệ sẽ áp dụng khi xuất bản.
          </div>
        </div>
        <CaretDownIcon
          size={16}
          className={`mt-1 shrink-0 text-brand-gold-light transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {!expanded && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
          {wm && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-sidebar-text">
              Watermark
            </span>
          )}
          {img && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-sidebar-text">
              Chống sao chép
            </span>
          )}
          {nft && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-sidebar-text">
              NFT
            </span>
          )}
        </div>
      )}

      {expanded && (
        <>
          <div className="mt-4 flex items-center gap-3 border-t border-white/8 py-[11px]">
            <FingerprintIcon size={20} color="var(--color-brand-gold-light)" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-white">Watermark động</div>
              <div className="text-[11px] text-sidebar-text-dim">
                Tên + ID người đọc trên nền
              </div>
            </div>
            <Toggle on={wm} onClick={() => setWm((value) => !value)} />
          </div>

          <div className="flex items-center gap-3 border-t border-white/8 py-[11px]">
            <ImageSquareIcon size={20} color="var(--color-brand-gold-light)" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-white">Render dạng ảnh</div>
              <div className="text-[11px] text-sidebar-text-dim">Chống bôi đen sao chép</div>
            </div>
            <Toggle on={img} onClick={() => setImg((value) => !value)} />
          </div>

          <div className="flex items-center gap-3 border-t border-white/8 py-[11px] pb-3.5">
            <SealCheckIcon size={20} color="var(--color-brand-gold-light)" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-white">Chứng nhận NFT</div>
              <div className="text-[11px] text-sidebar-text-dim">
                {nft ? "Đúc token sở hữu trên blockchain" : "Tắt - không đúc token"}
              </div>
            </div>
            <Toggle on={nft} onClick={() => setNft((value) => !value)} />
          </div>

          {nft && (
            <div className="flex items-center gap-[11px] rounded-[10px] border border-brand-gold-light/30 bg-brand-gold-light/12 p-3">
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-brand-gold-light text-[11px] font-bold text-brand-ink-dark">
                NFT
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">Sẽ đúc khi xuất bản</div>
                <div className="truncate text-[11px] text-sidebar-text-dim">
                  Token #VIN-0142 · Polygon
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
