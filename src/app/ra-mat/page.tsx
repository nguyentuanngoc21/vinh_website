import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { WaitlistLanding } from "@/components/waitlist/waitlist-landing";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Vịnh Câu Chuyện — Sắp ra mắt",
  description:
    "Vịnh Câu Chuyện — nơi những câu chuyện tìm thấy nhau. Đăng ký để biết ngay khi ra mắt.",
};

// Trang chờ ra mắt, độc lập với "/" — không dùng SiteHeader/nav (điều
// hướng tới các mục Audio/Blog/Thiết kế/Kết nối/Bảng xếp hạng chưa hoàn
// thiện không hợp lý ở đây). Mục đích duy nhất: đo số người đang chờ Vịnh
// ra mắt, tách theo độc giả/tác giả — xem src/app/api/waitlist/route.ts.
export default function LaunchWaitlistPage() {
  return (
    <div className={lora.variable}>
      <WaitlistLanding />
    </div>
  );
}
