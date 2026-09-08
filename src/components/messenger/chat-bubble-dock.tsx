"use client";

import { usePathname } from "next/navigation";
import { useNowPlaying } from "@/lib/audio/now-playing-context";
import { useChatBubbles } from "@/lib/chat-bubbles";
import type { MessageContext } from "@/lib/use-conversations";
import { UserAvatar } from "@/components/user-avatar";
import { ChatBubbleWindow } from "@/components/messenger/chat-bubble-window";

/**
 * Mounted site-wide ở root layout (cùng cấp MiniPlayerBar, xem
 * app/layout.tsx) — bong bóng chat nổi phải theo được người dùng qua mọi
 * trang, không riêng /ca-nhan. CHỈ desktop (ẩn dưới breakpoint lg) — trên
 * mobile không có overlay nổi thật kiểu app, xem ghi chú
 * useIsDesktopChatViewport ở chat-bubbles.tsx. Vẫn render JSX trên mọi
 * kích thước màn hình, chỉ ẩn bằng CSS `hidden lg:flex` — đơn giản hơn
 * unmount có điều kiện, tránh mất state cửa sổ khi resize qua lại
 * breakpoint (vd mở DevTools responsive mode).
 */
export function ChatBubbleDock() {
  const { windows, expand, conversations, markThreadRead } = useChatBubbles();
  const { track } = useNowPlaying();
  const pathname = usePathname();

  if (windows.length === 0) return null;

  // MiniPlayerBar chiếm trọn dải dưới cùng khi có bài đang phát (xem
  // mini-player-bar.tsx) — nâng dock lên tránh đè lẫn nhau. 72px là ước
  // lượng chiều cao thật của thanh đó ở desktop, cùng kiểu ước lượng "cần
  // chỉnh lại nếu đổi" như top-[124px] ở chat-tab.tsx — không có cách đo
  // tự động ở đây.
  const miniPlayerVisible = Boolean(track) && pathname !== "/audio/now-playing";

  const expandedWindow = windows.find((w) => w.mode === "expanded");
  const minimizedWindows = windows
    .filter((w) => w.mode !== "expanded")
    .sort((a, b) => a.lastInteractedAt - b.lastInteractedAt);

  const unreadCountFor = (userId: string, context: MessageContext) =>
    conversations.find((c) => c.userId === userId && c.context === context)?.unreadCount ?? 0;

  return (
    <div
      style={{ bottom: miniPlayerVisible ? 72 : 16 }}
      className="pointer-events-none fixed right-4 z-40 hidden flex-col items-end gap-2 lg:flex"
    >
      {minimizedWindows.length > 0 && (
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          {minimizedWindows.map((w) => {
            const unread = unreadCountFor(w.userId, w.context);
            return (
              <button
                key={`${w.userId}::${w.context}`}
                type="button"
                onClick={() => expand(w.userId, w.context)}
                title={w.nickname}
                className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-[0_6px_18px_rgba(0,0,0,.22)] transition-transform hover:scale-105"
              >
                <UserAvatar userId={w.userId} nickname={w.nickname} avatarUrl={w.avatarUrl} size={48} />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B02A37] px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {expandedWindow && (
        <div className="pointer-events-auto">
          <ChatBubbleWindow conv={expandedWindow} onThreadRead={markThreadRead} />
        </div>
      )}
    </div>
  );
}
