import { requireSupabase } from './supabase';
import type { Database } from '../types/database';

export type Notification = Pick<Database['public']['Tables']['notifications']['Row'], 'id' | 'title' | 'link' | 'read_at' | 'created_at'>;
async function clientFor(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || !userId || data.session?.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.');
  return client;
}
export async function getNotifications(userId: string): Promise<Notification[]> {
  const client = await clientFor(userId);
  const { data, error } = await client.from('notifications').select('id,title,link,read_at,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(30).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được thông báo. Vui lòng thử lại.');
  await clientFor(userId);
  return data ?? [];
}
export async function markNotificationRead(userId: string, id: string) {
  if (!id) throw new Error('Thông báo không hợp lệ.');
  const client = await clientFor(userId);
  const { data, error } = await client.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', id).is('read_at', null).select('id,read_at')
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw new Error('Chưa đánh dấu đã đọc được. Vui lòng thử lại.');
  await clientFor(userId);
  // A zero-row update may mean another device already marked it. Reload rather than assume success.
  return data;
}
