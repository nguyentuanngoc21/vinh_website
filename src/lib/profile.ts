import type { TransactionType } from "@/lib/supabase/types";

export type ProfileTab = "following" | "chat" | "edit" | "agree" | "tasks";

export const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: "edit", label: "Thông tin cá nhân", icon: "pencil" },
  { id: "chat", label: "Hội thoại", icon: "chat" },
  { id: "following", label: "Đang theo dõi", icon: "users" },
  { id: "agree", label: "Cam kết & Thỏa thuận", icon: "seal" },
  { id: "tasks", label: "Nhiệm vụ ngày", icon: "target" },
];

// Cũng dùng để tô màu avatar fallback (không có avatar_url thật) ở
// chat-tab.tsx/connect-directory.tsx — chọn tone theo hash(userId), xem
// toneFor() ở đó.
export const AVATAR_TONES = ["#2F5D6E", "#7A5C3E", "#4A5D3A", "#6B4356", "#3D4B77", "#8A6B2F"];

// Bảng nhãn hiển thị cho type giao dịch thật (transactions.type) — thay
// cho TOKEN_LOGS mock trước đây. Không join sang chapters/books nên nhãn
// chỉ chung chung theo loại giao dịch, không nêu tên truyện/tác giả cụ
// thể (getTransactions() hiện chỉ select("*") trên transactions).
const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  signup_bonus: "Thưởng đăng ký",
  daily_task_reward: "Nhiệm vụ ngày",
  purchase_chapter: "Mở chương",
  topup: "Nạp token",
  refund: "Hoàn token",
  admin_adjustment: "Điều chỉnh bởi quản trị viên",
  screenshot_penalty: "Phạt chụp màn hình",
  purchase_credit: "Doanh thu bán truyện",
  withdrawal: "Rút token",
  platform_bonus: "Thưởng từ Vịnh",
  quest_reward: "Thưởng nhiệm vụ",
  streak_bonus: "Thưởng đọc liên tục",
  streak_rescue: "Trả token cứu streak",
};

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type;
}

// Chỉ còn dùng bởi lib/topup.ts (luồng nạp token vẫn mock, chưa nối DB) —
// "Thông tin cá nhân"/ProfileHeader giờ lấy số dư thật qua
// GET /api/wallet/balance (xem edit-profile-tab.tsx, profile-page.tsx),
// không đọc hằng số này nữa.
export const DEFAULT_TOKEN_BALANCE_NUM = 1240;
