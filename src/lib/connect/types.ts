import type { CreatorTag } from "@/lib/supabase/types";

// Kiểu dữ liệu của trang "Kết nối" — dùng chung cho loader server-side
// (src/lib/connect/directory.ts, src/lib/contests/profile-contests.ts) và
// component client (src/components/connect/connect-directory.tsx), để lib
// không phải import ngược từ component.

export type ConnectWorkItem = {
  id: string;
  title: string;
  meta: string;
  date: string;
  href: string | null;
  imageUrl: string | null;
  audioUrl?: string | null;
};

export type ConnectService = {
  id: string;
  serviceType: "illustration" | "voice" | "ghostwriting";
  name: string;
  minPrice: number | null;
  deliveryDays: number | null;
  /** "available" (xanh) / "busy" (đỏ) / "off" (xám, không tooltip) — xem
   * src/lib/orders/service-listing-service.ts computeCommissionStatus().
   * Đếm theo TỪNG gói riêng, không cộng dồn theo người bán. */
  commissionStatus: "available" | "busy" | "off";
  activeCommissionCount: number;
  monthlyCommissionLimit: number | null;
};

export type ConnectPerson = {
  id: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  bio: string | null;
  joined: string;
  creatorTags: CreatorTag[];
  followerCount: number;
  isFollowingByViewer: boolean;
  /** Chỉ gồm listing is_accepting_orders=true & không riêng tư — xem
   * src/app/ket-noi/page.tsx (GET service_listings). */
  services: ConnectService[];
  works: {
    truyen: ConnectWorkItem[];
    audio: ConnectWorkItem[];
    design: ConnectWorkItem[];
    /** Cuộc thi đã tham gia + thứ hạng / giải + huy hiệu Passport (Contest Engine Slice 3.3). */
    cuoc_thi: ConnectWorkItem[];
  };
};
