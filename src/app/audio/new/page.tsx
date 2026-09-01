import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { AudioUploadForm } from "@/components/audio-hub/audio-upload-form";
import { MyNarrationsList } from "@/components/audio-hub/my-narrations-list";
import { createClient } from "@/lib/supabase/server";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Đăng tải Audio — Vịnh",
};

/** Đăng 1 bản thu ĐỘC LẬP lên kho Audio — POST /api/audio (source:
 * 'independent'). Xem ghi chú phạm vi ở src/lib/audio/get-audio-catalog.ts. */
export default async function NewAudioNarrationPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  // Bảng gốc (không phải view public_audio_narrations) — RLS "narrators
  // view their own audio narrations (incl. share token)" cho phép chủ sở
  // hữu thấy cả share_token của chính mình, cần để dựng link chia sẻ.
  const { data: ownNarrations } = await supabase
    .from("audio_narrations")
    .select("id, title, genre, duration_seconds, share_token, created_at")
    .eq("narrator_id", userData.user.id)
    .order("created_at", { ascending: false });

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main className="mx-auto max-w-[640px] px-6 py-12 sm:px-11">
          <div className="text-xs font-semibold tracking-[1.4px] text-brand-gold-dark">
            KHO AUDIO
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-lora)] text-[28px] font-bold leading-[1.2] text-brand-ink">
            Đăng tải bản thu mới
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-[1.6] text-stone-dark">
            Đăng bản ghi âm của bạn lên kho Audio công khai — bản ghi gắn dấu
            chìm âm thanh tự động, tác giả có thể xem hồ sơ và liên hệ thuê
            qua trang Kết nối.
          </p>
          <AudioUploadForm className="mt-8" />
          <MyNarrationsList
            narrations={(ownNarrations ?? []).map((n) => ({
              id: n.id,
              title: n.title,
              genre: n.genre,
              durationSeconds: n.duration_seconds,
              shareToken: n.share_token,
              createdAt: n.created_at,
            }))}
          />
        </main>
      </div>
    </div>
  );
}
