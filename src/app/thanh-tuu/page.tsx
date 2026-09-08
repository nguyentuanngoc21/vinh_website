import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AchievementsPage } from "@/components/achievements/achievements-page";

export const metadata: Metadata = {
  title: "Thành tựu — Vịnh",
};

/**
 * Trang riêng, vào từ menu avatar (auth-cluster.tsx) — cùng cấp với
 * Nhiệm vụ/Thông tin cá nhân/Trang viết truyện, không phải tab con.
 */
export default function AchievementsRoutePage() {
  return (
    <div className="flex-1 bg-[#f2f2f3]">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main>
          <AchievementsPage />
        </main>
      </div>
    </div>
  );
}
