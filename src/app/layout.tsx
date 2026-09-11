import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RoleProvider } from "@/lib/role";
import { NowPlayingProvider } from "@/lib/audio/now-playing-context";
import { MiniPlayerBar } from "@/components/audio-hub/mini-player-bar";
import { ChatBubbleProvider } from "@/lib/chat-bubbles";
import { ChatBubbleDock } from "@/components/messenger/chat-bubble-dock";
import { NavigationOverlay } from "@/components/ui/navigation-overlay";
import { NavigationPendingProvider } from "@/lib/navigation/pending-navigation";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Vịnh — Truyện chữ, truyện audio & blog",
  description:
    "Nền tảng truyện chữ, truyện audio và blog tiếng Việt với bảo vệ bản quyền cho tác giả.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white font-sans text-ink">
        {/* Bọc NGOÀI CÙNG (kể cả NavigationOverlay) — usePendingNavigate()
            có thể được gọi từ bất kỳ đâu trong {children} (form đăng
            nhập/đăng ký...), và bản thân NavigationOverlay đọc state pending
            từ đây thay vì tự giữ (xem pending-navigation.tsx). */}
        <NavigationPendingProvider>
          {/* Cũng bọc ngoài cùng cùng lý do — reader.tsx (nested sâu trong
              {children}) gọi useToast() cho "Đã sao chép liên kết". */}
          <ToastProvider>
            <RoleProvider>
              <NowPlayingProvider>
                {/* Bao {children} — MessengerBell (auth-cluster.tsx, nằm trong
                    SiteHeader ở từng trang) cần useChatBubbles() để mở bong
                    bóng chat nổi (Phase 2 đặc tả "bong bóng chat"). */}
                <ChatBubbleProvider>
                  {children}
                  {/* Site-wide, not just /audio — chương audio bây giờ phát
                      được từ /read (xem reader.tsx), nên thanh phát phải hiện
                      bất kể đang ở trang nào, không riêng khu vực Audio. */}
                  <MiniPlayerBar />
                  {/* Cùng lý do: bong bóng chat nổi phải theo được người dùng
                      qua mọi trang, không riêng /ca-nhan — xem
                      chat-bubble-dock.tsx (tự ẩn dưới breakpoint lg). */}
                  <ChatBubbleDock />
                </ChatBubbleProvider>
              </NowPlayingProvider>
            </RoleProvider>
            {/* Đè lên trang HIỆN TẠI trong lúc chờ trang mới render — không
                thay thế nội dung như app/loading.tsx (đã bỏ, xem
                navigation-overlay.tsx). */}
            <NavigationOverlay />
          </ToastProvider>
        </NavigationPendingProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
