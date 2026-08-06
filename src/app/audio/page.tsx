import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ContinueListening } from "@/components/audio-hub/continue-listening";
import { ResumeRow } from "@/components/audio-hub/resume-row";
import { LibraryGrid } from "@/components/audio-hub/library-grid";
import { NarratorsRow } from "@/components/audio-hub/narrators-row";
import { MiniPlayerBar } from "@/components/audio-hub/mini-player-bar";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Audio — Vịnh",
};

export default function AudioHubPage() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white pb-24">
        <SiteHeader
          searchPlaceholder="Tìm truyện audio…"
          ctaLabel="Đăng tải Audio"
        />
        <main>
          <ContinueListening />
          <ResumeRow />
          <LibraryGrid />
          <NarratorsRow />
          <section className="px-11 pb-10 pt-[34px]">
            <div className="flex items-center justify-between rounded-[20px] bg-[#F7EFD8] px-10 py-8">
              <div>
                <div className="text-[22px] font-bold text-brand-ink">
                  Có giọng đọc hay?
                </div>
                <div className="mt-[5px] text-[14.5px] text-[#6b5f3a]">
                  Ghi âm tác phẩm và chia sẻ trên Vịnh — bản ghi được gắn
                  watermark âm thanh tự động.
                </div>
              </div>
              <Link
                href="/author"
                className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
              >
                Gửi bản thu
              </Link>
            </div>
          </section>
        </main>
      </div>
      <MiniPlayerBar />
    </div>
  );
}
