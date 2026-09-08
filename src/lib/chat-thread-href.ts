import type { MessageContext } from "@/lib/use-conversations";

/**
 * Link vào ĐÚNG 1 luồng trong tab "Hội thoại" đầy đủ ở /ca-nhan (nơi có
 * OrderCard đầy đủ hành động, side panel...) — dùng ở cả flyout
 * (messenger-bell.tsx) lẫn panel bong bóng thu gọn (chat-bubble-window.tsx)
 * làm lối thoát sang bản đầy đủ. Cùng quy ước link admin đã dùng ở
 * api/admin/chapters/[chapterId]/route.ts.
 */
export function chatThreadHref(userId: string, context: MessageContext): string {
  return `/ca-nhan?tab=chat&chat=${userId}${context === "moderation" ? "&context=moderation" : ""}`;
}
