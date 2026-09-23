import { requireSupabase } from './supabase';
import type { Database } from '../types/database';

type BookRow = Database['public']['Tables']['books']['Row'];
export type Book = Pick<BookRow, 'id' | 'title' | 'slug' | 'synopsis' | 'genre' | 'view_count' | 'created_at'>;
export async function getBooks(): Promise<Book[]> {
  const { data, error } = await requireSupabase().from('books')
    .select('id,title,slug,synopsis,genre,view_count,created_at')
    .eq('published', true).is('deleted_at', null)
    .order('view_count', { ascending: false }).limit(60).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được truyện. Kiểm tra kết nối và thử lại.');
  return data ?? [];
}

export async function getFirstChapter(bookId: string) {
  const { data, error } = await requireSupabase().from('chapters')
    .select('id').eq('book_id', bookId).eq('published', true).is('removed_at', null)
    .order('order_index').limit(1).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw new Error('Không tải được danh sách chương. Vui lòng thử lại.');
  if (!data) throw new Error('Truyện này chưa có chương được xuất bản.');
  return data.id;
}

export type ReaderChapter = {
  id: string; bookId: string; title: string; bookTitle: string; content: string;
  price: number; gate: 'none' | 'login' | 'purchase';
  previousId: string | null; nextId: string | null;
};

export async function getChapter(id: string, signal: AbortSignal): Promise<ReaderChapter> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Chưa cấu hình địa chỉ máy chủ đọc truyện (EXPO_PUBLIC_API_URL).');
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw new Error('Không đọc được phiên đăng nhập.');
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  const response = await fetch(`${base.replace(/\/$/, '')}/api/mobile/chapters/${encodeURIComponent(id)}`, { headers, signal });
  if (!response.ok) throw new Error(response.status === 404 ? 'Chương không tồn tại hoặc đã được gỡ.' : 'Không tải được chương. Kiểm tra máy chủ và thử lại.');
  return response.json();
}
