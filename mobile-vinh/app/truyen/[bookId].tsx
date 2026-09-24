import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Book, ChapterSummary, CHAPTER_PAGE_SIZE, getBook, getChapterPage, getFirstChapter } from '../../src/services/books';
import { openLibraryBook } from '../../src/services/library';
import { useAuth } from '../../src/providers/AuthProvider';
import { SaveBook } from '../../src/components/SaveBook';

export default function BookDetail() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Detail key={`${bookId}:${session?.user.id ?? 'guest'}`} bookId={bookId} userId={session?.user.id} />;
}

function Detail({ bookId, userId }: { bookId: string; userId?: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const alive = useRef(true);
  const loadLock = useRef(false);
  const openLock = useRef(false);
  const offset = useRef(0);
  const load = useCallback(async (append = false) => {
    if (loadLock.current) return;
    loadLock.current = true;
    setLoading(true);
    if (append) setPageError(''); else { setError(''); setPageError(''); }
    try {
      const start = append ? offset.current : 0;
      const [detail, page] = await Promise.all([
        append ? Promise.resolve(null) : getBook(bookId), getChapterPage(bookId, start),
      ]);
      if (!alive.current) return;
      if (detail) setBook(detail);
      setChapters(old => append ? [...old, ...page.filter(c => !old.some(o => o.id === c.id))] : page);
      offset.current = start + page.length;
      setMore(page.length === CHAPTER_PAGE_SIZE);
    } catch (e) {
      if (alive.current) (append ? setPageError : setError)(e instanceof Error ? e.message : 'Không thể kết nối.');
    } finally {
      loadLock.current = false;
      if (alive.current) setLoading(false);
    }
  }, [bookId]);
  useEffect(() => {
    let active = true;
    alive.current = true;
    loadLock.current = true;
    Promise.all([getBook(bookId), getChapterPage(bookId)]).then(([detail, page]) => {
      if (!active) return;
      setBook(detail); setChapters(page);
      offset.current = page.length; setMore(page.length === CHAPTER_PAGE_SIZE);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Không thể kết nối.');
    }).finally(() => {
      if (active) { loadLock.current = false; setLoading(false); }
    });
    return () => { active = false; alive.current = false; };
  }, [bookId]);
  async function read() {
    if (openLock.current) return;
    openLock.current = true; setBusy(true); setPageError('');
    try {
      const chapterId = userId ? await openLibraryBook(userId, bookId) : await getFirstChapter(bookId);
      if (alive.current) router.push({ pathname: '/doc/[chapterId]', params: { chapterId } });
    } catch (e) {
      if (alive.current) setPageError(e instanceof Error ? e.message : 'Chưa thể mở truyện.');
    } finally { openLock.current = false; if (alive.current) setBusy(false); }
  }
  return <SafeAreaView className="flex-1 bg-cream-card">
    <StatusBar style="dark" />
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="px-6 py-4">
      <Text className="text-base text-brand-ink">← Quay lại</Text>
    </Pressable>
    <FlatList data={error ? [] : chapters} keyExtractor={item => item.id} refreshing={loading} onRefresh={() => void load()}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      ListHeaderComponent={<>
        {!!error ? <View className="mb-6"><Text accessibilityLiveRegion="polite" className="mb-3 text-red-700">{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} className="py-3"><Text className="font-bold text-brand-ink">Thử lại</Text></Pressable></View>
          : book && <>
            <Text className="mb-3 text-sm tracking-widest text-stone">{book.genre || 'VỊNH · TRUYỆN'}</Text>
            <Text accessibilityRole="header" className="mb-4 text-3xl font-bold leading-10 text-brand-ink">{book.title}</Text>
            <Text className="mb-6 text-sm text-stone">{book.view_count.toLocaleString('vi')} lượt xem</Text>
            <Text className="mb-6 text-base leading-7 text-brand-ink">{book.synopsis || 'Truyện chưa có lời giới thiệu.'}</Text>
            <Pressable accessibilityRole="button" disabled={busy || !chapters.length} onPress={() => void read()}
              style={{ opacity: busy || !chapters.length ? 0.5 : 1 }} className="mb-4 items-center rounded-2xl bg-brand-ink p-4">
              <Text className="font-bold text-white">{busy ? 'Đang mở…' : userId ? 'Đọc / tiếp tục đọc →' : 'Bắt đầu đọc →'}</Text>
            </Pressable>
            <SaveBook bookId={bookId} />
            <Text accessibilityRole="header" className="mb-2 mt-8 text-xl font-bold text-brand-ink">Mục lục</Text>
            <Text className="mb-5 text-sm leading-6 text-stone">Chọn chương để đọc. Quyền truy cập chương có phí được kiểm tra khi mở.</Text>
          </>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <Text className="py-6 text-stone">Truyện chưa có chương được xuất bản.</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/doc/[chapterId]', params: { chapterId: item.id } })}
        className="mb-3 rounded-2xl border border-cream-border p-4">
        <Text className="mb-2 text-base font-bold text-brand-ink">{item.title}</Text>
        <Text className="text-sm text-stone">{item.price > 0 ? `${item.price.toLocaleString('vi')} xu` : 'Miễn phí'} →</Text>
      </Pressable>}
      ListFooterComponent={<>
        {!!pageError && <Text accessibilityLiveRegion="polite" className="my-4 text-red-700">{pageError}</Text>}
        {more && !error && <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load(true)} className="items-center py-5">
          <Text className="font-bold text-brand-ink">{loading ? 'Đang tải…' : 'Tải thêm chương'}</Text>
        </Pressable>}
      </>} />
  </SafeAreaView>;
}
