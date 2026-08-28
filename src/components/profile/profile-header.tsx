"use client";

import { useRef, useState } from "react";
import { CameraIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";

type ProfileHeaderProps = {
  nickname: string;
  username: string;
  joinedYear: string;
  tokenBalance: string;
  coverImageUrl: string | null;
  /** Bắn lên profile-page.tsx sau khi tải/gỡ ảnh bìa thành công — cùng
   * pattern onNicknameSaved, để ProfileHeader luôn hiển thị đúng ảnh mới
   * nhất mà không cần load lại trang. */
  onCoverSaved?: (url: string | null) => void;
};

const COVER_MAX_BYTES = 5 * 1024 * 1024;

export function ProfileHeader({
  nickname,
  username,
  joinedYear,
  tokenBalance,
  coverImageUrl,
  onCoverSaved,
}: ProfileHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cho phép chọn lại đúng file đó ở lần sau (onChange không bắn lại
    // nếu value không đổi).
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Chỉ nhận file ảnh.");
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError("Ảnh bìa tối đa 5MB.");
      return;
    }

    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("cover", file);
    const res = await fetch("/api/profile/cover", { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Tải ảnh bìa thất bại.");
      return;
    }
    onCoverSaved?.(data.coverImageUrl ?? null);
  };

  return (
    <>
      <div
        className="relative h-[120px] w-full bg-brand-ink sm:h-[170px] lg:h-[210px]"
        style={
          coverImageUrl
            ? { backgroundImage: `url(${coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: "linear-gradient(135deg, var(--color-brand-ink) 0%, var(--color-brand-ink-dark) 100%)" }
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={handlePick}
          disabled={pending}
          className="absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:cursor-default disabled:opacity-60 sm:right-6 lg:right-11"
        >
          <CameraIcon weight="fill" size={14} />
          {pending ? "Đang tải…" : "Đổi ảnh bìa"}
        </button>
      </div>

      {error && (
        <div className="px-4 pt-2 sm:px-8 lg:px-11">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <section className="flex flex-col items-center gap-4 px-4 pt-0 text-center sm:flex-row sm:items-end sm:gap-[22px] sm:px-8 sm:text-left lg:px-11">
        <div className="-mt-10 flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full border-4 border-white bg-brand-ink text-[30px] font-bold text-brand-gold-light sm:-mt-11">
          {nickname[0]}
        </div>
        <div className="min-w-0 pt-3 sm:pt-0">
          <div className="font-[family-name:var(--font-lora)] text-2xl font-bold leading-[1.2] text-brand-ink sm:text-[28px]">
            {nickname}
          </div>
          <div className="mt-1 text-sm text-stone">
            {username && `@${username}`}
            {username && joinedYear && " · "}
            {joinedYear && `Tham gia từ ${joinedYear}`}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[13.5px] text-stone-dark sm:justify-start">
            {/* Đang theo dõi/người theo dõi vẫn là số mock — chưa join
                author_follows theo cả 2 chiều (khác phạm vi "nối nickname/bio/
                token vào DB" lần này), không hiển thị nhầm là số thật. */}
            <div>
              <b className="font-bold text-ink">128</b> đang theo dõi
            </div>
            <div>
              <b className="font-bold text-ink">4.216</b> người theo dõi
            </div>
            <div>
              <b className="font-bold text-brand-gold-dark">{tokenBalance}</b> token
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
