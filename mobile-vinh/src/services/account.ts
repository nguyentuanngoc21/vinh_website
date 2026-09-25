import { requireSupabase } from './supabase';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];
export type AccountProfile = Pick<Profile, 'nickname' | 'username' | 'bio' | 'token_balance' | 'token_balance_pending'>;
export type AccountTransaction = Pick<Transaction, 'id' | 'type' | 'amount' | 'status' | 'created_at'>;

async function accountClient(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || !userId || data.session?.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  return client;
}
export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  const client = await accountClient(userId);
  const { data, error } = await client.from('profiles')
    .select('nickname,username,bio,token_balance,token_balance_pending').eq('id', userId)
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw new Error('Không tải được hồ sơ và số dư. Vui lòng thử lại.');
  if (!data) throw new Error('Không tìm thấy hồ sơ tài khoản.');
  await accountClient(userId);
  return data;
}
export async function getRecentTransactions(userId: string): Promise<AccountTransaction[]> {
  const client = await accountClient(userId);
  const { data, error } = await client.from('transactions')
    .select('id,type,amount,status,created_at').eq('user_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được lịch sử giao dịch. Vui lòng thử lại.');
  await accountClient(userId);
  return data ?? [];
}
const labels: Record<Transaction['type'], string> = {
  signup_bonus: 'Thưởng đăng ký', daily_task_reward: 'Thưởng nhiệm vụ hằng ngày',
  purchase_chapter: 'Mua chương', topup: 'Nạp xu', refund: 'Hoàn xu', admin_adjustment: 'Điều chỉnh số dư',
  screenshot_penalty: 'Phạt chụp màn hình', purchase_credit: 'Thu nhập từ chương', withdrawal: 'Rút xu',
  platform_bonus: 'Thưởng từ Vịnh', quest_reward: 'Thưởng nhiệm vụ', streak_bonus: 'Thưởng chuỗi ngày',
  streak_rescue: 'Khôi phục chuỗi ngày', order_payment: 'Thanh toán đơn hàng', order_earning: 'Thu nhập đơn hàng',
  order_refund: 'Hoàn xu đơn hàng', achievement_bonus: 'Thưởng thành tựu',
};
const statuses: Record<Transaction['status'], string> = {
  pending: 'Chờ xử lý', processing: 'Đang xử lý', available: 'Khả dụng', completed: 'Hoàn tất', failed: 'Thất bại', reversed: 'Đã đảo giao dịch',
};
export function transactionLabel(type: string) { return labels[type as Transaction['type']] ?? 'Giao dịch khác'; }
export function transactionStatus(status: string) { return statuses[status as Transaction['status']] ?? 'Chưa xác định'; }
