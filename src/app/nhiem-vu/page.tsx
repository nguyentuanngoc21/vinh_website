import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { DailyTasksTab } from "@/components/profile/daily-tasks-tab";

export const metadata: Metadata = {
  title: "Nhiệm vụ — Vịnh",
};

/**
 * Trước đây là tab "tasks" bên trong /ca-nhan (ProfilePage) — tách ra
 * thành trang riêng, vào từ menu avatar (auth-cluster.tsx), cùng cấp với
 * Thông tin cá nhân/Trang viết truyện thay vì là 1 tab con. DailyTasksTab
 * giữ nguyên (tự fetch /api/quests/pool, không phụ thuộc gì vào
 * ProfilePage) — chỉ đổi nơi nó được render.
 */
export default function QuestsRoutePage() {
  return (
    <div className="flex-1 bg-[#f2f2f3]">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main>
          <DailyTasksTab />
        </main>
      </div>
    </div>
  );
}
