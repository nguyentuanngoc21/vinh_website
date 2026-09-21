import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { DesignGallery } from "@/components/design/design-gallery";
import { getDesignGallery } from "@/lib/design/get-design-gallery";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Thiết kế — Vịnh",
};

/**
 * Trước đây 100% mock (DESIGN_PINS, src/lib/design-gallery.ts) đứng sau
 * <DevelopmentOverlay>. Giờ đọc public_design_items thật (category/
 * description/share_count + design_item_like_counts, xem
 * migrations/20260901_add_design_item_gallery_metadata.sql và
 * src/lib/design/get-design-gallery.ts) — overlay đã gỡ.
 */
export default async function DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ album?: string }>;
}) {
  const { album } = await searchParams;
  const supabase = await createClient();
  const viewerId = await getAuthedUserId();
  const items = await getDesignGallery(supabase, viewerId, album ?? null);
  const activeAlbum = album
    ? ((await supabase.from("design_albums").select("id, name").eq("id", album).maybeSingle()).data ?? null)
    : null;

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader searchPlaceholder="Tìm ảnh bìa…" searchType="thiet-ke" />
        <main>
          {viewerId && (
            <div className="flex justify-end px-11 pt-5">
              <Link
                href="/thiet-ke/quan-ly"
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e2ded7] px-4 py-2 text-[12.5px] font-semibold text-brand-ink no-underline transition-colors hover:border-brand-gold hover:bg-[#fdf8ec]"
              >
                <ImageSquareIcon size={14} /> Quản lý ảnh của tôi
              </Link>
            </div>
          )}
          <DesignGallery items={items} activeAlbum={activeAlbum} />

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
      </div>
    </div>
  );
}
