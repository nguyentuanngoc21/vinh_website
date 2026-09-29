"use client";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/role";
import { startVisiblePolling } from "@/lib/hooks/visible-polling";

export type MessageContext = "personal" | "moderation";

export type Conversation = {
  userId: string;
  context: MessageContext;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  isModerationThread: boolean;
  lastMessage: { body: string; createdAt: string; mine: boolean };
  unreadCount: number;
  // Có ít nhất 1 đơn dịch vụ với đối tác này — xem api/messages/route.ts.
  hasOrder: boolean;
};

// Cùng nhịp với danh sách hội thoại ở chat-tab.tsx (không có realtime
// trong repo này, xem ghi chú ở đó). MessengerBell (flyout) và
// ChatBubbleDock (dot chưa đọc trên bong bóng nổi) dùng CHUNG 1 vòng poll
// qua hook này thay vì mỗi nơi tự gọi /api/messages riêng — tránh gọi API
// trùng khi cả 2 cùng mounted.
const POLL_MS = 15_000;

function keyOf(userId: string, context: MessageContext) {
  return `${userId}::${context}`;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/messages")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setConversations(data.conversations ?? []);
          setLoaded(true);
        }),
    []
  );

  // Hook này được mount ở root layout (ChatBubbleProvider) cho MỌI khách —
  // chỉ poll khi đã đăng nhập (khách luôn nhận 401, gọi chỉ tốn function
  // invocation) và khi tab đang hiện; quay lại tab thì tải ngay 1 lần.
  const { isLogged } = useRole();
  useEffect(() => {
    if (!isLogged) return;
    return startVisiblePolling(load, POLL_MS);
  }, [isLogged, load]);

  // Gọi ngay khi 1 luồng vừa được đọc (mở flyout row/bong bóng/thread) —
  // zero badge tức thời thay vì chờ vòng poll 15s tiếp theo, cùng cách
  // chat-tab.tsx tự làm cho tab "Hội thoại" của riêng nó.
  const markThreadRead = useCallback((userId: string, context: MessageContext) => {
    setConversations((prev) =>
      prev.map((c) => (keyOf(c.userId, c.context) === keyOf(userId, context) ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  // Đăng xuất: ẩn dữ liệu của phiên cũ ngay (không setState trong effect).
  return {
    conversations: isLogged ? conversations : [],
    loaded: isLogged && loaded,
    markThreadRead,
    reload: load,
  };
}
