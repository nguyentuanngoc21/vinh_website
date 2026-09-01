import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RoleProvider } from "@/lib/role";
import { NowPlayingProvider } from "@/lib/audio/now-playing-context";
import { MiniPlayerBar } from "@/components/audio-hub/mini-player-bar";
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
        <RoleProvider>
          <NowPlayingProvider>
            {children}
            {/* Site-wide, not just /audio — chương audio bây giờ phát
                được từ /read (xem reader.tsx), nên thanh phát phải hiện
                bất kể đang ở trang nào, không riêng khu vực Audio. */}
            <MiniPlayerBar />
          </NowPlayingProvider>
        </RoleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
