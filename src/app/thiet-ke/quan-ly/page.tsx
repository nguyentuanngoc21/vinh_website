import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { DesignManageGallery } from "@/components/design/design-manage-gallery";
import { createClient } from "@/lib/supabase/server";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Quản lý ảnh thiết kế — Vịnh",
};

/**
 * Trang quản lý ảnh ĐÃ đăng — khác /thiet-ke/new (form đăng, chỉ giữ
 * danh sách trong state của phiên hiện tại). Cho phép xoá 1 ảnh đăng sai
 * ở bất kỳ lượt đăng nào trước đó, kể cả sau khi đã rời trang đăng hoặc
 * đã bấm "Hoàn tất".
 */
export default async function DesignManagePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main className="mx-auto max-w-[1160px] px-6 py-12 sm:px-11">
          <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
            THƯ VIỆN THIẾT KẾ
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink">
            Ảnh của tôi
          </h1>
          <p className="mt-2.5 max-w-[640px] text-[14.5px] leading-[1.6] text-stone-dark">
            Toàn bộ ảnh bạn đã đăng, kể cả những lượt trước — xoá tại đây nếu có ảnh đăng sai.
          </p>
          <div className="mt-8">
            <DesignManageGallery />
          </div>
        </main>
      </div>
    </div>
  );
}
