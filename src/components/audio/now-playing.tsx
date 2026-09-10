"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  SkipBackIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  MoonIcon,
  ShieldCheckIcon,
  LockKeyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { VinhMark } from "@/components/ui";
import { formatClock } from "@/lib/audio/get-audio-catalog";
import { useNowPlaying } from "@/lib/audio/now-playing-context";
import { LoginGateModal } from "@/components/access-gate/login-gate-modal";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SLEEPS: (number | null)[] = [null, 15, 30, 45];

export function NowPlaying() {
  const { track, isPlaying, currentTime, duration, audioGated, toggle, pause, seek, skip, setPlaybackRate } =
    useNowPlaying();
  const [speedIdx, setSpeedIdx] = useState(SPEEDS.indexOf(1));
  const [sleepIdx, setSleepIdx] = useState(0);
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sleep = SLEEPS[sleepIdx];

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    setPlaybackRate(SPEEDS[next]);
  };

  const cycleSleep = () => {
    setSleepIdx((i) => (i + 1) % SLEEPS.length);
  };

  // Hẹn giờ ngủ THẬT — tự pause() khi hết giờ, không chỉ đổi nhãn nút.
  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleep) {
      sleepTimerRef.current = setTimeout(() => {
        pause();
        setSleepIdx(0);
      }, sleep * 60 * 1000);
    }
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [sleep, pause]);

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-11 py-[30px] text-center text-sidebar-text">
        <VinhMark size={34} tone="cream" />
        <p className="text-white">Chưa phát bản thu nào.</p>
        <Link
          href="/audio"
          className="rounded-full bg-brand-gold px-6 py-3 text-sm font-semibold text-brand-ink no-underline"
        >
          Về Kho Audio
        </Link>
      </div>
    );
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col overflow-hidden px-4 py-5 sm:px-8 sm:py-7 lg:px-11 lg:py-[30px] text-sidebar-text">
      <div className="mb-auto flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/audio">
            <CaretDownIcon
              size={24}
              color="var(--color-sidebar-text)"
              className="cursor-pointer transition-transform active:scale-90 shrink-0"
            />
          </Link>
          <div className="truncate text-[13px] font-medium text-sidebar-text-dim">
            ĐANG PHÁT · {track.title}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <VinhMark size={28} tone="cream" />
          <div className="text-lg font-extrabold text-white">Vịnh</div>
        </div>
      </div>

      <div className="relative my-auto flex flex-col items-center">
        {/* Bọc toàn bộ artwork + seek bar + controls trong 1 khối để làm mờ
            + vô hiệu hoá tương tác 1 lượt khi audioGated (khách vừa nghe
            hết % preview) — thẻ khoá đè lên trên (absolute inset-0 bên
            dưới) là nơi duy nhất còn bấm được. */}
        <div className={audioGated ? "pointer-events-none w-full select-none blur-[6px] opacity-50" : "w-full"}>
          <div className="relative mx-auto flex h-[min(280px,calc(100vw-3rem))] w-[min(280px,calc(100vw-3rem))] max-h-[300px] max-w-[300px] flex-col justify-end rounded-[20px] bg-gradient-to-br from-brand-ink to-[#7a2e1c] p-5 sm:p-[26px] text-white shadow-[0_24px_60px_rgba(0,0,0,.5)]">
            {track.genre && (
              <div className="text-xs tracking-[2px] text-white/80">{track.genre.toUpperCase()}</div>
            )}
            <div className="mt-1.5 font-[family-name:var(--font-lora)] text-xl sm:text-[26px] font-bold leading-[1.15]">
              {track.title}
            </div>
          </div>

          <div className="my-5 sm:my-[30px] w-full max-w-[420px]">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[var(--color-brand-gold-light)]"
              style={{
                background: `linear-gradient(to right, var(--color-brand-gold-light) ${pct}%, #3a6275 ${pct}%)`,
                borderRadius: 999,
              }}
            />
          </div>
          <div className="flex w-full max-w-[420px] justify-between text-xs font-medium text-sidebar-text-dim">
            <span>{formatClock(currentTime)}</span>
            <span>{formatClock(duration)}</span>
          </div>

          <div className="mt-4 text-center">
            <div className="font-[family-name:var(--font-lora)] text-xl sm:text-[22px] font-bold text-white">
              {track.title}
            </div>
            <div className="mt-1 text-sm text-sidebar-text-dim">Diễn đọc: {track.narratorName}</div>
          </div>

          <div className="mt-6 flex items-center gap-3 sm:gap-[26px]">
            <button
              type="button"
              onClick={cycleSpeed}
              className="w-[42px] cursor-pointer text-center text-[13px] font-bold text-brand-gold-light transition-transform active:scale-90"
            >
              {SPEEDS[speedIdx]}×
            </button>
            <button type="button" onClick={() => skip(-15)} className="cursor-pointer transition-transform active:scale-90">
              <SkipBackIcon weight="fill" size={24} color="var(--color-sidebar-text)" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex h-14 w-14 sm:h-[68px] sm:w-[68px] cursor-pointer items-center justify-center rounded-full bg-brand-gold text-brand-ink transition-transform active:scale-90"
            >
              {isPlaying ? <PauseIcon weight="fill" size={26} /> : <PlayIcon weight="fill" size={26} />}
            </button>
            <button type="button" onClick={() => skip(15)} className="cursor-pointer transition-transform active:scale-90">
              <SkipForwardIcon weight="fill" size={24} color="var(--color-sidebar-text)" />
            </button>
            <button
              type="button"
              onClick={cycleSleep}
              style={{ color: sleep ? "var(--color-brand-gold-light)" : "var(--color-sidebar-text)" }}
              className="flex w-[42px] cursor-pointer flex-col items-center transition-transform active:scale-90"
            >
              <MoonIcon size={20} />
              <span className="mt-0.5 text-[10px] font-semibold">{sleep ? `${sleep}p` : "Hẹn"}</span>
            </button>
          </div>
        </div>

        {audioGated && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-brand-ink-dark/75 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-brand-gold-light">
              <LockKeyIcon size={22} weight="fill" />
            </div>
            <div className="font-[family-name:var(--font-lora)] text-lg font-bold text-white">
              Đăng nhập để nghe tiếp
            </div>
            <p className="max-w-[320px] text-[13px] leading-[1.6] text-sidebar-text-dim">
              Bạn vừa nghe hết phần xem trước dành cho khách. Đăng nhập miễn phí để nghe toàn bộ bản thu này.
            </p>
            <button
              type="button"
              onClick={() => setGateModalOpen(true)}
              className="mt-1 cursor-pointer rounded-full bg-brand-gold px-6 py-2.5 text-sm font-bold text-brand-ink"
            >
              Đăng nhập để nghe tiếp
            </button>
          </div>
        )}
      </div>

      <LoginGateModal
        open={gateModalOpen}
        onClose={() => setGateModalOpen(false)}
        title="Đăng nhập để nghe tiếp"
        description="Bạn vừa nghe hết phần xem trước dành cho khách. Đăng nhập miễn phí để nghe toàn bộ bản thu này."
        returnTo="/audio/now-playing"
      />

      <div className="mt-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-center sm:text-left">
        <Link
          href={`/ket-noi?p=${track.narratorId}`}
          className="flex items-center gap-2 rounded-full border border-white/20 px-[18px] py-[9px] text-[13px] font-semibold text-sidebar-text no-underline transition-transform active:scale-90"
        >
          Xem hồ sơ {track.narratorName}
        </Link>
        <div className="flex items-center gap-2 text-xs font-medium text-[#6f8794]">
          <ShieldCheckIcon color="var(--color-brand-gold-light)" /> Âm thanh có dấu vân số theo
          phiên nghe
        </div>
      </div>
    </div>
  );
}
