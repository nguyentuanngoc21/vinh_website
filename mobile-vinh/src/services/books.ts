import { requireSupabase } from './supabase';
import type { Database } from '../types/database';

type BookRow = Database['public']['Tables']['books']['Row'];
export type Book = Pick<BookRow, 'id' | 'title' | 'slug' | 'synopsis' | 'genre' | 'view_count' | 'created_at'>;
export type ChapterSummary = Pick<Database['public']['Tables']['chapters']['Row'], 'id' | 'title' | 'order_index' | 'price'>;
export const CHAPTER_PAGE_SIZE = 50;
export const SEARCH_PAGE_SIZE = 20;
export async function searchBooks(term: string, offset = 0): Promise<Book[]> {
  const title = term.trim();
  if (!title || title.length > 120) throw new Error('Nhập tên truyện từ 1 đến 120 ký tự.');
  if (title.includes('*')) throw new Error('Vui lòng bỏ ký tự * khỏi tên truyện cần tìm.');
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Trang kết quả không hợp lệ.');
  const pattern = title.replace(/[\\%_]/g, char => `\\${char}`);
  const { data, error } = await requireSupabase().from('books')
    .select('id,title,slug,synopsis,genre,view_count,created_at')
    .eq('published', true).is('deleted_at', null).ilike('title', `%${pattern}%`)
    .order('created_at', { ascending: false }).order('id')
    .range(offset, offset + SEARCH_PAGE_SIZE - 1).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tìm kiếm được truyện. Kiểm tra mạng và thử lại.');
  return data ?? [];
}

export async function getBook(bookId: string): Promise<Book> {
  const { data, error } = await requireSupabase().from('books')
    .select('id,title,slug,synopsis,genre,view_count,created_at')
    .eq('id', bookId).eq('published', true).is('deleted_at', null)
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw new Error('Không tải được thông tin truyện. Vui lòng thử lại.');
  if (!data) throw new Error('Truyện không tồn tại hoặc đã được gỡ.');
  return data;
}

// Only public metadata; the Reader API remains responsible for content access.
export async function getChapterPage(bookId: string, offset = 0): Promise<ChapterSummary[]> {
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Trang chương không hợp lệ.');
  const { data, error } = await requireSupabase().from('chapters')
    .select('id,title,order_index,price').eq('book_id', bookId)
    .eq('published', true).is('removed_at', null)
    .order('order_index').order('id').range(offset, offset + CHAPTER_PAGE_SIZE - 1)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được mục lục. Vui lòng thử lại.');
  return data ?? [];
}
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
