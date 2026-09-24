import { requireSupabase } from './supabase';
import { getFirstChapter, type Book } from './books';
import { mobileApi } from './api';

export type Progress = { book_id: string; chapter_id: string; last_paragraph_index: number | null; updated_at: string };
export type LibraryEntry = { book: Book; progress?: Progress; lists: { id: string; name: string }[] };
const bookFields = 'id,title,slug,synopsis,genre,view_count,created_at' as const;
export async function requireReader(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng mở lại Tủ sách.');
  return client;
}
export async function getProgress(userId: string, bookId: string): Promise<Progress | null> {
  await progressWrites;
  const client = await requireReader(userId);
  const { data, error } = await client.from('book_progress')
    .select('book_id,chapter_id,last_paragraph_index,updated_at').eq('user_id', userId).eq('book_id', bookId)
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw new Error('Không tải được vị trí đọc đã lưu. Vui lòng thử lại.');
  return data;
}
// All writes share a queue so a slow previous chapter cannot overwrite the next.
let progressWrites: Promise<unknown> = Promise.resolve();
// Goes through the backend (not a direct upsert) so completing a chapter also records
// reading_history, streak and quest progress exactly like the web Reader.
export function saveProgress(userId: string, bookId: string, chapterId: string, paragraphIndex: number, completed = false) {
  const write = progressWrites.then(async () => {
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) throw new Error('Vị trí đọc không hợp lệ.');
    await requireReader(userId);
    try {
      await mobileApi(`books/${encodeURIComponent(bookId)}/reading-progress`, userId, { chapterId, paragraphIndex, completed });
    } catch (e) {
      // Server messages are plain Errors; network, timeout and parse failures get a generic hint.
      throw new Error(e instanceof Error && e.name === 'Error' ? e.message : 'Chưa lưu được vị trí đọc. Kiểm tra mạng và thử lại.');
    }
  });
  progressWrites = write.catch(() => undefined);
  return write;
}
export function resumeIndex(progress: Progress | null, chapterId: string, paragraphCount: number) {
  if (!progress || progress.chapter_id !== chapterId || !paragraphCount) return 0;
  return Math.max(0, Math.min(paragraphCount - 1, progress.last_paragraph_index ?? 0));
}
export async function getLibrary(userId: string): Promise<LibraryEntry[]> {
  await progressWrites;
  const client = await requireReader(userId);
  const [progress, lists] = await Promise.all([
    client.from('book_progress').select('book_id,chapter_id,last_paragraph_index,updated_at').eq('user_id', userId)
      .order('updated_at', { ascending: false }).abortSignal(AbortSignal.timeout(15000)),
    client.from('reading_lists').select('id,name').eq('user_id', userId).abortSignal(AbortSignal.timeout(15000)),
  ]);
  if (progress.error || lists.error) throw new Error('Không tải được Tủ sách. Vui lòng thử lại.');
  const items = lists.data.length ? await client.from('reading_list_items').select('book_id,list_id,added_at')
    .in('list_id', lists.data.map(l => l.id)).order('added_at', { ascending: false }).abortSignal(AbortSignal.timeout(15000)) : { data: [], error: null };
  if (items.error) throw new Error('Không tải được truyện đã lưu.');
  const ids = [...new Set([...progress.data.map(p => p.book_id), ...items.data.map(i => i.book_id)])];
  if (!ids.length) return [];
  const books = await client.from('books').select(bookFields).in('id', ids).eq('published', true).is('deleted_at', null)
    .abortSignal(AbortSignal.timeout(15000));
  if (books.error) throw new Error('Không tải được thông tin truyện.');
  return ids.flatMap(id => {
    const book = books.data.find(b => b.id === id);
    return book ? [{ book, progress: progress.data.find(p => p.book_id === id),
      lists: lists.data.filter(l => items.data.some(i => i.book_id === id && i.list_id === l.id)) }] : [];
  });
}
export async function openLibraryBook(userId: string, bookId: string) {
  await progressWrites;
  const progress = await getProgress(userId, bookId);
  if (progress) {
    const client = await requireReader(userId);
    const result = await client.from('chapters').select('id').eq('id', progress.chapter_id).eq('book_id', bookId)
      .eq('published', true).is('removed_at', null).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
    if (result.error) throw new Error('Không kiểm tra được chương đọc dở.');
    if (result.data) return result.data.id;
  }
  return getFirstChapter(bookId);
}
export async function getBookLists(userId: string, bookId: string) {
  const client = await requireReader(userId);
  const lists = await client.from('reading_lists').select('id,name').eq('user_id', userId).order('created_at')
    .abortSignal(AbortSignal.timeout(15000));
  if (lists.error) throw new Error('Không tải được danh sách đọc.');
  const items = lists.data.length ? await client.from('reading_list_items').select('list_id').eq('book_id', bookId)
    .in('list_id', lists.data.map(l => l.id)).abortSignal(AbortSignal.timeout(15000)) : { data: [], error: null };
  if (items.error) throw new Error('Không kiểm tra được truyện đã lưu.');
  return lists.data.map(l => ({ ...l, contains: items.data.some(i => i.list_id === l.id) }));
}
export async function setBookSaved(userId: string, listId: string, bookId: string, saved: boolean) {
  const client = await requireReader(userId);
  const result = saved
    ? await client.from('reading_list_items').upsert({ list_id: listId, book_id: bookId }, { onConflict: 'list_id,book_id', ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(15000))
    : await client.from('reading_list_items').delete().eq('list_id', listId).eq('book_id', bookId).abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw new Error('Không cập nhật được truyện đã lưu. Vui lòng thử lại.');
}
export async function createReadingList(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Tên danh sách cần từ 1 đến 80 ký tự.');
  const client = await requireReader(userId);
  const result = await client.from('reading_lists').insert({ user_id: userId, name: trimmed }).select('id,name').abortSignal(AbortSignal.timeout(15000)).single();
  if (result.error) throw new Error('Không tạo được danh sách đọc.');
  return result.data;
}
