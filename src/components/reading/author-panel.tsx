import { ShareNetworkIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { ThemeColors } from "./reader";

type AuthorPanelProps = {
  /** "rail" = cột trái sticky (chỉ hiện ở màn hình rộng, xl+), layout dọc.
   * "inline" = hàng ngang, chèn đầu nội dung khi màn hình hẹp hơn xl. */
  variant: "rail" | "inline";
  authorName: string;
  authorAvatarUrl: string | null;
  isOwnBook: boolean;
  showFollowButton: boolean;
  following: boolean;
  pending: boolean;
  onToggleFollow: () => void;
  onShareExcerpt: () => void;
  c: ThemeColors;
};

/**
 * Avatar tác giả + tên + Follow/Following + nút chia sẻ đoạn đang đọc.
 * KHÔNG hiện số người theo dõi (đã chốt với người dùng). Ẩn hẳn nút Follow
 * khi isOwnBook (tác giả không tự follow được mình) hoặc chưa đăng nhập
 * (showFollowButton=false) — không hiện dạng disabled, ẩn hoàn toàn.
 */
export function AuthorPanel({
  variant,
  authorName,
  authorAvatarUrl,
  isOwnBook,
  showFollowButton,
  following,
  pending,
  onToggleFollow,
  onShareExcerpt,
  c,
}: AuthorPanelProps) {
  const avatarSize = variant === "rail" ? 56 : 40;

  const avatar = authorAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={authorAvatarUrl}
      alt={authorName}
      style={{ width: avatarSize, height: avatarSize }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <div
      style={{ width: avatarSize, height: avatarSize, background: "var(--color-brand-gold-dark)" }}
      className="flex shrink-0 items-center justify-center rounded-full text-white"
    >
      <span className="text-base font-bold">{authorName[0] ?? "?"}</span>
    </div>
  );

  const followButton = showFollowButton && !isOwnBook && (
    <button
      type="button"
      onClick={onToggleFollow}
      disabled={pending}
      style={{
        background: following ? "rgba(0,0,0,.06)" : "var(--color-brand-gold)",
        color: following ? c.ink : "var(--color-brand-ink)",
      }}
      className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors disabled:cursor-default disabled:opacity-70 ${
        variant === "rail" ? "w-full" : ""
      }`}
    >
      {following ? "Đang theo dõi" : "Theo dõi"}
    </button>
  );

  const shareButton = (
    <button
      type="button"
      onClick={onShareExcerpt}
      title="Chia sẻ đoạn đang đọc"
      aria-label="Chia sẻ đoạn đang đọc"
      style={{ color: c.inkSoft }}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs transition-colors hover:text-brand-gold-dark"
    >
      <ShareNetworkIcon size={16} /> {variant === "rail" && "Chia sẻ đoạn này"}
    </button>
  );

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3">
        {avatar}
        <span style={{ color: c.ink }} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {authorName}
        </span>
        {followButton}
        {shareButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      {avatar}
      <span style={{ color: c.ink }} className="flex items-center gap-1 text-sm font-semibold">
        <UserCircleIcon size={15} style={{ color: c.inkSoft }} /> {authorName}
      </span>
      {followButton}
      {shareButton}
    </div>
  );
}
