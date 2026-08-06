import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { RankingsBoard } from "@/components/rankings/rankings-board";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Bảng xếp hạng — Vịnh",
};

export default function RankingsPage() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main>
          <RankingsBoard />

          <section className="px-11 pb-[46px] pt-[26px]">
            <div className="flex items-center justify-between rounded-[20px] bg-brand-ink-dark px-10 py-8 text-white">
              <div>
                <div className="text-[22px] font-bold">
                  Muốn tác phẩm của bạn lên bảng?
                </div>
                <div className="mt-[5px] text-[14.5px] text-sidebar-text-dim-2">
                  Đăng đều đặn, mở chương miễn phí đầu tuần và theo dõi chỉ
                  số trong trang tác giả.
                </div>
              </div>
              <Link
                href="/author"
                className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
              >
                Xem chỉ số của tôi
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
