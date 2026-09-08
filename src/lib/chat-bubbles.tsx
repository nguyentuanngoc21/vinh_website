"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useConversations, type Conversation, type MessageContext } from "@/lib/use-conversations";

export type BubbleWindow = {
  userId: string;
  context: MessageContext;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  isModerationThread: boolean;
  mode: "expanded" | "minimized";
  lastInteractedAt: number;
};

// Định danh + trạng thái cửa sổ — KHÔNG mang nickname/avatar. Đây mới là
// state THẬT (lưu trong useState + localStorage); BubbleWindow đầy đủ ở
// trên được TÍNH LẠI từ đây + conversations mỗi lần render (xem
// ChatBubbleProvider), không lưu trực tiếp — tên/avatar nhờ vậy luôn là
// bản MỚI NHẤT thay vì bản đã cache có thể cũ.
type WindowState = {
  userId: string;
  context: MessageContext;
  mode: "expanded" | "minimized";
  lastInteractedAt: number;
};

type ChatBubbleContextValue = {
  windows: BubbleWindow[];
  // useConversations() SỐNG Ở ĐÂY (không phải trong MessengerBell/
  // ChatBubbleDock riêng) — trước đó mỗi nơi tự gọi hook này, tạo 2 vòng
  // poll /api/messages ĐỘC LẬP chạy song song dù cả 2 luôn mounted cùng
  // lúc (header + root layout). Gộp về 1 nguồn duy nhất ở Provider, mọi
  // nơi khác chỉ ĐỌC qua useChatBubbles().
  conversations: Conversation[];
  conversationsLoaded: boolean;
  markThreadRead: (userId: string, context: MessageContext) => void;
  openConversation: (userId: string, context: MessageContext) => void;
  minimize: (userId: string, context: MessageContext) => void;
  expand: (userId: string, context: MessageContext) => void;
  close: (userId: string, context: MessageContext) => void;
};

const ChatBubbleContext = createContext<ChatBubbleContextValue | null>(null);

/**
 * Bong bóng chat nổi (mục 3-4 đặc tả "bong bóng chat"). Chỉ CHỌN 1 giản
 * lược có chủ đích so với Messenger web desktop (nhiều cửa sổ cạnh nhau):
 * ở đây chỉ 1 cửa sổ được "expanded" (đang mở) tại 1 thời điểm — mở 1 hội
 * thoại khác sẽ tự minimize hội thoại đang mở trước đó xuống bong bóng.
 *
 * Tối đa MAX_WINDOWS cửa sổ được GIỮ (cả đang mở lẫn đã minimize, đúng
 * mục 3: "tối đa 3, chỉ lấy 3 chat được mở mới nhất") — mở hội thoại thứ 4
 * sẽ đẩy văng cửa sổ có lastInteractedAt cũ nhất. lastInteractedAt CHỈ cập
 * nhật khi người dùng chủ động mở/expand/minimize — KHÔNG cập nhật khi có
 * tin nhắn mới tới, để bong bóng không tự nhảy vị trí ngoài ý muốn.
 */
const MAX_WINDOWS = 3;

function keyOf(userId: string, context: MessageContext) {
  return `${userId}::${context}`;
}

// ---- Persist qua localStorage (theo TỪNG trình duyệt, không đồng bộ đa
// thiết bị — chấp nhận được, đây chỉ là tiện ích nhớ "đang chat dở gì",
// không phải state cần đồng bộ thật). CHỈ lưu WindowState (định danh +
// trạng thái) — KHÔNG lưu nickname/avatarUrl/isModerationThread vì dễ cũ
// (đối tác đổi tên/avatar, hoặc bị khoá/xoá tài khoản giữa 2 lần ghé) —
// những trường đó luôn được tính lại từ conversations MỚI NHẤT (xem
// ChatBubbleProvider), không đọc từ bản đã lưu.
const STORAGE_KEY = "vinh:chat-bubbles:v1";

function loadPersisted(): WindowState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is WindowState => {
      const win = w as Partial<WindowState> | null;
      return (
        !!win &&
        typeof win.userId === "string" &&
        (win.context === "personal" || win.context === "moderation") &&
        (win.mode === "expanded" || win.mode === "minimized") &&
        typeof win.lastInteractedAt === "number"
      );
    });
  } catch {
    // Trình duyệt riêng tư / storage bị chặn / JSON hỏng — coi như không
    // có gì để khôi phục, không vỡ tính năng chỉ vì đọc lỗi.
    return [];
  }
}

function savePersisted(states: WindowState[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // Hết quota / storage bị chặn — bỏ qua, không lưu được thì thôi.
  }
}

export function ChatBubbleProvider({ children }: { children: ReactNode }) {
  const { conversations, loaded: conversationsLoaded, markThreadRead } = useConversations();
  // Khởi tạo TRỰC TIẾP từ localStorage qua lazy initializer — đọc đồng bộ,
  // không phụ thuộc dữ liệu async nào (không giống việc tính BubbleWindow
  // đầy đủ bên dưới, vốn cần đợi `conversations` tải xong) nên an toàn gọi
  // ngay ở useState thay vì trong 1 effect riêng.
  const [windowStates, setWindowStates] = useState<WindowState[]>(loadPersisted);

  useEffect(() => {
    savePersisted(windowStates);
  }, [windowStates]);

  // BubbleWindow ĐẦY ĐỦ (có nickname/avatar) được TÍNH LẠI mỗi lần render
  // từ windowStates + conversations — không lưu riêng, không cần effect
  // "hydrate/reconcile" nào. Cửa sổ nào không còn khớp hội thoại thật (đối
  // tác bị khoá/xoá tài khoản, hoặc conversations CHƯA tải xong lúc mới
  // vào trang) tự động bị loại ở phép tính này; tên/avatar luôn là bản MỚI
  // NHẤT chứ không phải bản đã lưu cache.
  const windows: BubbleWindow[] = windowStates
    .map((w): BubbleWindow | null => {
      const conv = conversations.find((c) => c.userId === w.userId && c.context === w.context);
      if (!conv) return null;
      return {
        userId: conv.userId,
        context: conv.context,
        nickname: conv.nickname,
        username: conv.username,
        avatarUrl: conv.avatarUrl,
        isModerationThread: conv.isModerationThread,
        mode: w.mode,
        lastInteractedAt: w.lastInteractedAt,
      };
    })
    .filter((w): w is BubbleWindow => w !== null);

  const openConversation = useCallback((userId: string, context: MessageContext) => {
    const now = Date.now();
    setWindowStates((prev) => {
      const key = keyOf(userId, context);
      const others = prev
        .filter((w) => keyOf(w.userId, w.context) !== key)
        .map((w): WindowState => (w.mode === "expanded" ? { ...w, mode: "minimized" } : w));
      const opened: WindowState = { userId, context, mode: "expanded", lastInteractedAt: now };
      return [...others, opened].sort((a, b) => b.lastInteractedAt - a.lastInteractedAt).slice(0, MAX_WINDOWS);
    });
  }, []);

  const expand = useCallback((userId: string, context: MessageContext) => {
    const key = keyOf(userId, context);
    setWindowStates((prev) =>
      prev.map((w): WindowState => {
        if (keyOf(w.userId, w.context) === key) return { ...w, mode: "expanded", lastInteractedAt: Date.now() };
        return w.mode === "expanded" ? { ...w, mode: "minimized" } : w;
      })
    );
  }, []);

  const minimize = useCallback((userId: string, context: MessageContext) => {
    const key = keyOf(userId, context);
    setWindowStates((prev) =>
      prev.map((w): WindowState =>
        keyOf(w.userId, w.context) === key ? { ...w, mode: "minimized", lastInteractedAt: Date.now() } : w
      )
    );
  }, []);

  const close = useCallback((userId: string, context: MessageContext) => {
    const key = keyOf(userId, context);
    setWindowStates((prev) => prev.filter((w) => keyOf(w.userId, w.context) !== key));
  }, []);

  return (
    <ChatBubbleContext.Provider
      value={{
        windows,
        conversations,
        conversationsLoaded,
        markThreadRead,
        openConversation,
        minimize,
        expand,
        close,
      }}
    >
      {children}
    </ChatBubbleContext.Provider>
  );
}

export function useChatBubbles() {
  const ctx = useContext(ChatBubbleContext);
  if (!ctx) throw new Error("useChatBubbles must be used within a ChatBubbleProvider");
  return ctx;
}

// Bong bóng nổi CHỈ dành cho desktop (>=1024px, breakpoint lg của
// Tailwind) — trên di động không có overlay nổi thật kiểu app (cần quyền
// hệ thống, không làm được trên web thường/PWA); MessengerBell vẫn điều
// hướng thẳng tới /ca-nhan?chat= như Phase 1 khi ở mobile, xem
// messenger-bell.tsx + chat-bubble-dock.tsx.
const DESKTOP_QUERY = "(min-width: 1024px)";
function initialIsDesktop(): boolean {
  return typeof window !== "undefined" ? window.matchMedia(DESKTOP_QUERY).matches : false;
}
export function useIsDesktopChatViewport() {
  const [isDesktop, setIsDesktop] = useState(initialIsDesktop);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
