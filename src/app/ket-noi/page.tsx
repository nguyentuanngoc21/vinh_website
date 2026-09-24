import type { Metadata } from "next";
import { Suspense } from "react";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ConnectDirectory } from "@/components/connect/connect-directory";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { loadConnectDirectory } from "@/lib/connect/directory";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Kết nối — Vịnh",
};

// Trang này cá nhân hoá theo viewer (getAuthedUserId đọc cookie phiên,
// isFollowingByViewer/isSelf/nút "Nhắn tin" đều phụ thuộc viewerId) — về
// bản chất không thể prerender tĩnh. Ép dynamic tường minh thay vì trông
// chờ Next.js tự phát hiện qua cookies() lồng sâu trong
// getAuthedUserId(): không có export này, Next thử prerender tĩnh lúc
// build, và nếu bước đó chạy TRƯỚC khi chạm cookies() (chẳng hạn
// createServiceRoleClient() phía trên ném lỗi vì thiếu env ở build step)
// thì cả build sập luôn thay vì rơi về dynamic rendering êm như mong đợi.
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  // Truy vấn nằm ở src/lib/connect/directory.ts — dùng chung với app mobile.
  const connectPeople = await loadConnectDirectory(supabase, viewerId);

  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main>
          <Suspense fallback={null}>
            <ConnectDirectory people={connectPeople} viewerId={viewerId} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
