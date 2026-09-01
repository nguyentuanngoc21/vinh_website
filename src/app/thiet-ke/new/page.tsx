import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { DesignUploadForm } from "@/components/design/design-upload-form";
import { createClient } from "@/lib/supabase/server";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Đăng thiết kế — Vịnh",
};

/**
 * Đăng 1 tác phẩm ĐỘC LẬP lên kho Thiết kế — POST /api/design (source:
 * 'independent'). Khác luồng "gắn bìa truyện" (source: 'story_upload',
 * tự động khi tác giả chọn ảnh bìa trong "Viết truyện") — trang đó vẫn
 * nằm ở book-overview.tsx, không đụng tới đây.
 */
export default async function NewDesignItemPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main className="mx-auto max-w-[640px] px-6 py-12 sm:px-11">
          <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
            THƯ VIỆN THIẾT KẾ
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink">
            Đăng thiết kế mới
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-[1.6] text-stone-dark">
            Đăng bìa truyện, minh họa, fan art hoặc poster audio lên kho Thiết
            kế công khai — tác phẩm gắn dấu chìm của bạn, tác giả có thể xem
            hồ sơ và liên hệ thuê qua trang Kết nối.
          </p>
          <DesignUploadForm className="mt-8" />
        </main>
      </div>
    </div>
  );
}
