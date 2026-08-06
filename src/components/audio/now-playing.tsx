"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  SkipBackIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  MoonIcon,
  BookOpenIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SLEEPS: (number | null)[] = [null, 15, 30, 45];

const WAVE_HEIGHTS = [
  14, 22, 30, 40, 34, 24, 16, 26, 38, 44, 32, 20, 12, 22, 34, 42, 30, 18, 26,
  36, 28, 16, 24, 34, 40, 30, 20, 14, 22, 32, 38, 26, 18, 28, 36, 24, 14, 20,
];

export function NowPlaying() {
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [sleepIdx, setSleepIdx] = useState(0);

  const sleep = SLEEPS[sleepIdx];

  return (
    <div className="flex flex-col overflow-hidden px-11 py-[30px] text-sidebar-text">
      <div className="mb-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <CaretDownIcon
              size={24}
              color="var(--color-sidebar-text)"
              className="cursor-pointer transition-transform active:scale-90"
            />
          </Link>
          <div className="text-[13px] font-medium text-sidebar-text-dim">
            ĐANG PHÁT · Vũng Vịnh Cuối Trời
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="var(--color-brand-ink)" />
            <path
              d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
              fill="var(--color-cream-card-alt)"
            />
            <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink)" />
          </svg>
          <div className="text-lg font-extrabold text-white">Vịnh</div>
        </div>
      </div>

      <div className="my-auto flex flex-col items-center">
        <div
          style={{
            background:
              "linear-gradient(155deg,#2563a8,#1f8a6b 55%,#7a2e1c)",
          }}
          className="relative flex h-[300px] w-[300px] flex-col justify-end rounded-[20px] p-[26px] text-white shadow-[0_24px_60px_rgba(0,0,0,.5)]"
        >
          <div className="text-xs tracking-[2px] text-white/80">
            TIỂU THUYẾT · AUDIO
          </div>
          <div className="mt-1.5 font-[family-name:var(--font-lora)] text-[30px] font-bold leading-[1.15]">
            Vũng Vịnh
            <br />
            Cuối Trời
          </div>
          <div className="absolute -right-2.5 -top-2.5 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-chart-green text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(0,0,0,.3)]">
            NFT
          </div>
        </div>

        <div className="my-[30px] flex h-12 w-full max-w-[420px] items-center justify-center gap-[3px]">
          {WAVE_HEIGHTS.map((h, i) => (
            <div
              key={i}
              style={{
                height: `${h}px`,
                opacity: i < 14 ? 1 : 0.35,
                background: i < 14 ? "var(--color-brand-gold-light)" : "#3a6275",
              }}
              className="w-[3px] rounded-[3px]"
            />
          ))}
        </div>
        <div className="flex w-full max-w-[420px] justify-between text-xs font-medium text-sidebar-text-dim">
          <span>12:08</span>
          <span>19:30</span>
        </div>

        <div className="mt-4 text-center">
          <div className="font-[family-name:var(--font-lora)] text-[22px] font-bold text-white">
            Chương 14 — Đêm không trăng
          </div>
          <div className="mt-1 text-sm text-sidebar-text-dim">Diễn đọc: Thu Hà</div>
        </div>

        <div className="mt-6 flex items-center gap-[26px]">
          <button
            type="button"
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            className="w-[42px] cursor-pointer text-center text-[13px] font-bold text-brand-gold-light transition-transform active:scale-90"
          >
            {SPEEDS[speedIdx]}×
          </button>
          <SkipBackIcon
            weight="fill"
            size={26}
            color="var(--color-sidebar-text)"
            className="cursor-pointer transition-transform active:scale-90"
          />
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-[68px] w-[68px] cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink transition-transform active:scale-90"
          >
            {playing ? (
              <PauseIcon weight="fill" size={30} />
            ) : (
              <PlayIcon weight="fill" size={30} />
            )}
          </button>
          <SkipForwardIcon
            weight="fill"
            size={26}
            color="var(--color-sidebar-text)"
            className="cursor-pointer transition-transform active:scale-90"
          />
          <button
            type="button"
            onClick={() => setSleepIdx((i) => (i + 1) % SLEEPS.length)}
            style={{ color: sleep ? "var(--color-brand-gold-light)" : "var(--color-sidebar-text)" }}
            className="flex w-[42px] cursor-pointer flex-col items-center transition-transform active:scale-90"
          >
            <MoonIcon size={22} />
            <span className="mt-0.5 text-[10px] font-semibold">
              {sleep ? `${sleep}p` : "Hẹn"}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <Link
          href="/read"
          className="flex items-center gap-2 rounded-full border border-white/20 px-[18px] py-[9px] text-[13px] font-semibold text-sidebar-text no-underline transition-transform active:scale-90"
        >
          <BookOpenIcon /> Đọc bản chữ
        </Link>
        <div className="flex items-center gap-2 text-xs font-medium text-[#6f8794]">
          <ShieldCheckIcon color="var(--color-brand-gold-light)" /> Âm thanh có dấu vân số theo
          phiên nghe
        </div>
      </div>
    </div>
  );
}
