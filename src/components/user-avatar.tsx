import { AVATAR_TONES } from "@/lib/profile";

/**
 * Tô màu avatar fallback (không có avatar_url thật) theo hash(userId) —
 * tách ra từ chat-tab.tsx để dùng chung với messenger-bell.tsx (bong bóng
 * chat ở header) mà không lặp lại logic. chat-tab.tsx vẫn giữ bản cục bộ
 * của nó cho tới khi refactor sâu hơn ở Phase 2 (bubble stack) — 2 bản
 * hiện cho cùng 1 kết quả vì cùng công thức hash + cùng AVATAR_TONES.
 */
export function toneFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function UserAvatar({
  userId,
  nickname,
  avatarUrl,
  size,
}: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  size: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nickname}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ background: toneFor(userId), width: size, height: size, fontSize: size * 0.36 }}
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
    >
      {nickname[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
