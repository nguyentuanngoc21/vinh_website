import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { DevelopmentOverlay } from "@/components/development-overlay";
import { DesignGallery } from "@/components/design/design-gallery";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Thiết kế — Vịnh",
};

export default function DesignPage() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader searchPlaceholder="Tìm ảnh bìa…" ctaLabel="Đăng thiết kế" />
        <DevelopmentOverlay>
          <main>
            <DesignGallery />

            <section className="px-11 pb-[46px] pt-[26px]">
              <div className="flex flex-wrap items-center justify-between gap-5 rounded-[20px] bg-brand-ink-dark px-10 py-8 text-white">
                <div>
                  <div className="text-[22px] font-bold">
                    Bạn vẽ bìa hoặc minh họa?
                  </div>
                  <div className="mt-[5px] text-[14.5px] text-sidebar-text-dim-2">
                    Đăng tác phẩm lên Vịnh — tác giả có thể thuê bạn ngay từ
                    trang hồ sơ.
                  </div>
                </div>
                <Link
                  href="/ket-noi"
                  className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
                >
                  Xem hồ sơ họa sĩ
                </Link>
              </div>
            </section>
          </main>
        </DevelopmentOverlay>
      </div>
    </div>
  );
}
