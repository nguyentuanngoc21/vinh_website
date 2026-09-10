"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AudioTrack } from "@/lib/audio/get-audio-catalog";
import { useRole } from "@/lib/role";
import { GUEST_PREVIEW_RATIO } from "@/lib/reading/access-gate";

/**
 * Site-wide real playback state — 1 <audio> element created once, kept
 * alive across client-side navigation because this provider is mounted at
 * the root layout (src/app/layout.tsx), which the App Router never
 * remounts on a route change. That's what lets MiniPlayerBar keep playing
 * while you browse elsewhere, and lets LibraryGrid/ResumeRow/
 * ContinueListening simply call play(track) instead of navigating to a
 * "load this id" route — no separate GET-single-track endpoint needed.
 *
 * Progress: saved to audio_progress (POST /api/audio/progress) at most
 * once every PROGRESS_SAVE_INTERVAL_MS while playing, plus immediately on
 * pause/ended/tab-close (keepalive fetch, matches the audio_progress RLS:
 * "users manage their own audio progress" — a 401 from that route while
 * signed out is expected and silently ignored, playback still works for
 * guests, it just isn't resumable across visits). play_count
 * (POST /api/audio/:id/play) fires once per track per browser session,
 * not once per second of listening.
 */

type NowPlayingContextValue = {
  track: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  /** true khi khách vãng lai (chưa đăng nhập) đã nghe hết
   * GUEST_PREVIEW_RATIO của track đang phát — audio đã tự pause, UI (
   * now-playing.tsx, mini-player-bar.tsx) tự hiện rào làm mờ + modal đăng
   * nhập khi cờ này bật, KHÔNG resume tới khi đổi track khác hoặc đăng
   * nhập. Luôn false nếu đã đăng nhập. */
  audioGated: boolean;
  play: (track: AudioTrack, resumeAtSeconds?: number) => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (deltaSeconds: number) => void;
  setPlaybackRate: (rate: number) => void;
};

const NowPlayingContext = createContext<NowPlayingContextValue | null>(null);

const PROGRESS_SAVE_INTERVAL_MS = 8000;

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  // NowPlayingProvider nằm TRONG RoleProvider ở root layout (xem
  // src/app/layout.tsx) nên gọi được useRole() ở đây. `isLogged` chỉ đọc
  // từ localStorage/sessionStorage phía client (role.tsx: "chỉ là cờ hiện/
  // ẩn UI, không phải lớp bảo mật") — dùng để gate audio là hợp lý vì audio
  // vốn đã là public URL từ Supabase Storage (không stream/signed URL, xem
  // toAudioTrack ở get-audio-catalog.ts), NÊN không có lớp bảo mật thật nào
  // để "vá" ở tầng server — chặn ở đây chỉ là rào trải nghiệm, cùng mức độ
  // với chính useRole() đã tự nhận.
  const { isLogged } = useRole();
  const isLoggedRef = useRef(isLogged);
  useEffect(() => {
    isLoggedRef.current = isLogged;
  }, [isLogged]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<AudioTrack | null>(null);
  const lastSavedAtRef = useRef(0);
  const playedThisSessionRef = useRef<Set<string>>(new Set());
  const playbackRateRef = useRef(1);

  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  // "Raw" — chỉ ghi true bên trong các callback phát/tua (onTimeUpdate,
  // clampForGuest), KHÔNG tự đọc lại `isLogged` để gỡ rào (tránh 1 effect
  // chỉ để đồng bộ state phái sinh — đăng nhập trong lúc đang bị gate, ví
  // dụ mở /dang-nhap ở tab khác rồi quay lại, thì AND với `!isLogged` ngay
  // dưới đây đã tự gỡ rào ngay lần render kế tiếp, không cần effect).
  const [audioGatedRaw, setAudioGated] = useState(false);
  const audioGated = audioGatedRaw && !isLogged;

  const saveProgress = useCallback((immediate: boolean) => {
    const audio = audioRef.current;
    const t = trackRef.current;
    if (!audio || !t) return;
    const now = Date.now();
    if (!immediate && now - lastSavedAtRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
    lastSavedAtRef.current = now;
    const positionSeconds = Math.floor(audio.currentTime);
    fetch("/api/audio/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioNarrationId: t.id, positionSeconds }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      // Khách vãng lai nghe hết % preview cho phép — pause + kẹp lại đúng
      // mốc giới hạn (không kẹp về 0, để UI vẫn hiện đúng chỗ vừa dừng) rồi
      // bật cờ audioGated cho UI tự hiện rào. Bỏ qua nếu đã đăng nhập hoặc
      // chưa rõ duration (đang tải).
      if (!isLoggedRef.current && audio.duration > 0) {
        const limit = audio.duration * GUEST_PREVIEW_RATIO;
        if (audio.currentTime >= limit) {
          audio.currentTime = limit;
          audio.pause();
          setAudioGated(true);
        }
      }
      setCurrentTime(audio.currentTime);
      saveProgress(false);
    };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      saveProgress(true);
    };
    const onEnded = () => {
      setIsPlaying(false);
      saveProgress(true);
    };
    const onBeforeUnload = () => saveProgress(true);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      window.removeEventListener("beforeunload", onBeforeUnload);
      audio.pause();
      audioRef.current = null;
    };
  }, [saveProgress]);

  const play = useCallback((next: AudioTrack, resumeAtSeconds?: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (trackRef.current?.id !== next.id) {
      // Chuyển bài — lưu tiến độ bài cũ trước khi rời (nếu có).
      if (trackRef.current) saveProgress(true);
      audio.src = next.audioUrl;
      audio.currentTime = resumeAtSeconds ?? 0;
      audio.playbackRate = playbackRateRef.current;
      trackRef.current = next;
      setTrack(next);
      setCurrentTime(resumeAtSeconds ?? 0);
      setDuration(0);
      // Track mới — mỗi track có preview riêng cho khách, không cộng dồn
      // rào của track vừa nghe trước đó.
      setAudioGated(false);

      if (!playedThisSessionRef.current.has(next.id)) {
        playedThisSessionRef.current.add(next.id);
        fetch(`/api/audio/${next.id}/play`, { method: "POST" }).catch(() => {});
      }
    }
    audio.play().catch(() => {
      // Trình duyệt chặn autoplay không có tương tác — isPlaying vẫn false,
      // MiniPlayerBar hiện nút Play để người dùng tự bấm.
    });
  }, [saveProgress]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  // Kẹp về đúng mốc giới hạn (không cho tua vượt qua) nếu khách vãng lai —
  // dùng chung cho seek() (kéo thanh trượt) và skip() (nút lùi/tới 15s),
  // tránh việc kéo thẳng thanh trượt qua mặt cơ chế chặn ở onTimeUpdate.
  // Tự pause ngay (không chờ tick timeupdate kế tiếp) nếu bị kẹp.
  const clampForGuest = useCallback((audio: HTMLAudioElement, target: number): number => {
    if (isLoggedRef.current || audio.duration <= 0) return target;
    const limit = audio.duration * GUEST_PREVIEW_RATIO;
    if (target >= limit) {
      setAudioGated(true);
      audio.pause();
      return limit;
    }
    return target;
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    audio.currentTime = clampForGuest(audio, Math.max(0, Math.min(seconds, audio.duration || seconds)));
    setCurrentTime(audio.currentTime);
  }, [clampForGuest]);

  const skip = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    audio.currentTime = clampForGuest(audio, Math.max(0, Math.min(audio.currentTime + deltaSeconds, audio.duration || 0)));
    setCurrentTime(audio.currentTime);
  }, [clampForGuest]);

  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRateState(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  return (
    <NowPlayingContext.Provider
      value={{ track, isPlaying, currentTime, duration, playbackRate, audioGated, play, pause, toggle, seek, skip, setPlaybackRate }}
    >
      {children}
    </NowPlayingContext.Provider>
  );
}

export function useNowPlaying() {
  const ctx = useContext(NowPlayingContext);
  if (!ctx) throw new Error("useNowPlaying must be used within a NowPlayingProvider");
  return ctx;
}
