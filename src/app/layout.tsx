import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { RoleProvider } from "@/lib/role";
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
        <RoleProvider>{children}</RoleProvider>
      </body>
    </html>
  );
}
