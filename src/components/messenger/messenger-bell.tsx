"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { UserAvatar } from "@/components/user-avatar";
import { timeLabel } from "@/lib/format-time";
import type { Conversation } from "@/lib/use-conversations";
import { useChatBubbles, useIsDesktopChatViewport } from "@/lib/chat-bubbles";
import { chatThreadHref } from "@/lib/chat-thread-href";

type TabId = "all" | "unread" | "transaction";
const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "transaction", label: "Giao dịch" },
];

/**
 * Icon "bong bóng chat" ở header, đứng TRƯỚC chuông thông báo (đúng thứ tự
 * Messenger trên Facebook — xem auth-cluster.tsx): icon + badge chưa đọc +
 * flyout 3 tab (Tất cả/Chưa đọc/Giao dịch).
 *
 * Bấm vào 1 hội thoại (Phase 2): trên DESKTOP (>=1024px) mở luôn thành
 * bong bóng nổi qua useChatBubbles().openConversation — KHÔNG điều hướng
 * rời trang. Trên mobile vẫn điều hướng thẳng tới tab "Hội thoại" trong
 * /ca-nhan như Phase 1 (không có overlay nổi thật trên web mobile, xem
 * chat-bubbles.tsx). "Xem tất cả trong Hội thoại" ở đáy luôn điều hướng,
 * bất kể kích thước màn hình — đây là lối thoát rõ ràng sang trang đầy đủ.
 *
 * `open`/`onOpenChange` do AuthCluster điều khiển (không tự giữ state) —
 * để mở bong bóng chat tự đóng chuông thông báo và ngược lại (2 flyout
 * cùng z-[60], không kiểm soát sẽ chồng lên nhau y hệt nếu cả 2 cùng mở,
 * nhất là bản mobile fixed full-width mới thêm ở trên).
 */
export function MessengerBell({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { conversations, conversationsLoaded: loaded, markThreadRead, openConversation } = useChatBubbles();
  const isDesktop = useIsDesktopChatViewport();
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, onOpenChange]);

  // Badge đếm số HỘI THOẠI chưa đọc (không phải tổng số tin) — đúng hành
  // vi Messenger, tránh badge nhảy số lớn bất thường nếu 1 người nhắn dồn
  // dập nhiều tin trong cùng 1 luồng.
  const unreadConversationsCount = conversations.filter((c) => c.unreadCount > 0).length;

  const filtered = conversations.filter((c) => {
    if (activeTab === "unread") return c.unreadCount > 0;
    if (activeTab === "transaction") return c.hasOrder;
    return true;
  });

  const emptyLabel =
    conversations.length === 0
      ? "Chưa có hội thoại nào — bấm \"Nhắn tin\" trên trang Kết nối để bắt đầu."
      : activeTab === "unread"
        ? "Không có hội thoại chưa đọc."
        : activeTab === "transaction"
          ? "Chưa có hội thoại nào gắn với giao dịch."
          : "Không tìm thấy hội thoại phù hợp.";

  const handleRowClick = (c: Conversation) => (e: React.MouseEvent) => {
    onOpenChange(false);
    if (!isDesktop) return; // mobile: để Link điều hướng như Phase 1
    e.preventDefault();
    openConversation(c.userId, c.context);
    // Mở bong bóng KHÔNG tự gọi GET thread ngay (ChatBubbleWindow tự fetch
    // khi mount) — zero badge sớm ở đây để không "nhấp nháy" chưa đọc
    // trong lúc panel đang tải lần đầu.
    markThreadRead(c.userId, c.context);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Tin nhắn"
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#3a3a3a] transition-colors hover:text-brand-gold-dark"
      >
        <ChatCircleIcon size={21} />
        {unreadConversationsCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B02A37] px-1 text-[10px] font-bold text-white">
            {unreadConversationsCount > 9 ? "9+" : unreadConversationsCount}
          </span>
        )}
      </button>
      {/* Dưới `sm`: `fixed` + kẹp lề trái/phải theo VIEWPORT, không theo vị
          trí icon — panel absolute right-0 rộng 360px neo vào chính icon
          này sẽ tràn ra ngoài mép trái màn hình trên điện thoại hẹp, vì
          MessengerBell không nằm ở rìa phải cùng của header (NotificationBell
          + avatar còn đứng sau nó, xem auth-cluster.tsx). top-[124px] cùng
          ước lượng chiều cao SiteHeader mobile (~110-125px) đã dùng ở
          chat-tab.tsx — panel mở HẲN dưới header thay vì đè lên thanh nav
          như bản absolute cũ (chấp nhận được cho panel gần full-width, đè
          lên sẽ rối hơn nhiều so với dropdown nhỏ góc màn hình).
          Từ `sm` trở lên: giữ NGUYÊN định vị cũ (absolute right-0
          top-[46px] w-[360px]) — đã đủ chỗ, không đổi hành vi đã có.

          flex flex-col + max-h-[calc(100vh-140px)] — điện thoại xoay ngang
          (viewport chỉ ~360-400px cao) có thể thấp hơn tổng chiều cao panel
          (header + tab + danh sách 400px + link đáy). Giới hạn TOÀN panel
          theo chiều cao màn hình thực tế, danh sách (flex-1 min-h-0 bên
          dưới) tự co lại nhường chỗ cho tab/link đáy luôn hiện đủ, thay vì
          cả panel tràn xuống dưới viewport không cách nào bấm tới link
          "Xem tất cả". 140px ước lượng top(124) + biên dưới — không ràng
          buộc trên desktop (viewport luôn thừa cao hơn nhiều). */}
      {open && (
        <div className="fixed inset-x-3 top-[124px] z-[60] flex max-h-[calc(100vh-140px)] w-auto flex-col overflow-hidden rounded-2xl border border-cream bg-white shadow-[0_14px_34px_rgba(0,0,0,.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[46px] sm:w-[360px]">
          <div className="shrink-0 border-b border-[#f1efec] px-[18px] py-3">
            <div className="text-[14.5px] font-semibold text-ink">Chat</div>
          </div>
          <div className="flex shrink-0 border-b border-[#f1efec] px-2">
            {TABS.map((t) => {
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    color: isActive ? "var(--color-brand-ink)" : "var(--color-stone-dark)",
                    borderBottomColor: isActive ? "var(--color-brand-gold)" : "transparent",
                  }}
                  className={`flex-1 -mb-px cursor-pointer border-b-2 px-2 py-2.5 text-center text-[12.5px] transition-colors ${
                    isActive ? "font-bold" : "font-medium"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loaded && filtered.length === 0 && (
              <div className="px-[18px] py-8 text-center text-[13px] text-stone-light">{emptyLabel}</div>
            )}
            {filtered.map((c) => (
              <Link
                key={`${c.userId}::${c.context}`}
                href={chatThreadHref(c.userId, c.context)}
                onClick={handleRowClick(c)}
                className="flex items-center gap-3 border-b border-[#f5f4f2] px-[18px] py-3 no-underline transition-colors last:border-b-0 hover:bg-cream-card"
              >
                <UserAvatar userId={c.userId} nickname={c.nickname} avatarUrl={c.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div
                        style={{ fontWeight: c.unreadCount > 0 ? 700 : 600 }}
                        className="truncate text-[13.5px] text-ink"
                      >
                        {c.nickname}
                      </div>
                      {c.isModerationThread && (
                        <span className="shrink-0 rounded-full bg-brand-ink px-1.5 py-0.5 text-[9px] font-semibold text-brand-gold-light">
                          Kiểm duyệt
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-[11px] text-[#a8a29e]">{timeLabel(c.lastMessage.createdAt)}</div>
                  </div>
                  <div
                    style={{
                      color: c.unreadCount > 0 ? "var(--color-ink)" : "var(--color-stone)",
                      fontWeight: c.unreadCount > 0 ? 600 : 400,
                    }}
                    className="mt-0.5 truncate text-[12px]"
                  >
                    {c.lastMessage.mine ? "Bạn: " : ""}
                    {c.lastMessage.body}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand-gold" aria-hidden />
                )}
              </Link>
            ))}
          </div>
          <Link
            href="/ca-nhan?tab=chat"
            onClick={() => onOpenChange(false)}
            className="block shrink-0 border-t border-[#f1efec] px-[18px] py-3 text-center text-[12.5px] font-semibold text-brand-gold-dark no-underline hover:bg-cream-card"
          >
            Xem tất cả trong Hội thoại
          </Link>
        </div>
      )}
    </div>
  );
}
