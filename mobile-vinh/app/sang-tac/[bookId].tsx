import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { BookInfoForm, type BookInfo } from '../../src/components/BookInfoForm';
import { Button, Notice, ScreenHeader } from '../../src/components/Form';
import {
  addChapters, deleteBook, deleteChapter, getMyBook, moveChapter, parseTags, reorderChapters, updateBook,
  type BookDetail, type BookFields, type ChapterRow,
} from '../../src/services/authoring';
import { promptMissingAgreement } from '../../src/services/agreement-prompt';

// The web /author/[bookId] overview: book details, chapters (drafts and removed ones too).
export default function BookOverview() {
  const { session, loading } = useAuth();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session || typeof bookId !== 'string') return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để sáng tác →</Text></Pressable>
  </SafeAreaView>;
  return <Overview key={`${session.user.id}:${bookId}`} userId={session.user.id} bookId={bookId} />;
}

const toInfo = (b: BookDetail): BookInfo => ({ title: b.title, genre: b.genre, synopsis: b.synopsis ?? '', tags: b.tags.join(', '), isExclusive: b.isExclusive });
const canDelete = (c: ChapterRow) => !c.published && !c.removed && !c.isLastChapter && !c.sold;

function Overview({ userId, bookId }: { userId: string; bookId: string }) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [info, setInfo] = useState<BookInfo | null>(null);
  const [order, setOrder] = useState<ChapterRow[] | null>(null); // non-null while reordering
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const lock = useRef(false);

  const load = useCallback(() => {
    const request = ++sequence.current;
    getMyBook(userId, bookId).then(next => {
      if (request !== sequence.current) return;
      setBook(next); setInfo(toInfo(next)); setOrder(null);
    }).catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được truyện.'); });
    return () => { sequence.current++; };
  }, [userId, bookId]);
  useFocusEffect(load);

  async function run(task: () => Promise<unknown>, done?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); if (done) setNotice(done); }
    catch (e) { if (!promptMissingAgreement(e)) setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { lock.current = false; setBusy(false); }
  }

  if (!book || !info) return <SafeAreaView className="flex-1 bg-cream-card">
    <View className="p-5">
      <ScreenHeader title="Tác phẩm" onBack={() => router.canGoBack() ? router.back() : router.replace('/sang-tac')} />
      {error ? <Text className="text-red-700">{error}</Text> : <ActivityIndicator color="#143b4d" />}
    </View>
  </SafeAreaView>;

  const original = toInfo(book);
  const changes: BookFields = {};
  if (info.title.trim() !== original.title) changes.title = info.title.trim();
  if (info.genre !== original.genre && info.genre) changes.genre = info.genre;
  if (info.synopsis.trim() !== original.synopsis.trim()) changes.synopsis = info.synopsis;
  const tags = parseTags(info.tags);
  if (tags.join('\n') !== book.tags.join('\n')) changes.tags = tags;
  if (info.isExclusive !== original.isExclusive) changes.is_exclusive = info.isExclusive;
  const dirty = Object.keys(changes).length > 0;
  const chapters = order ?? book.chapters;

  const saveInfo = () => {
    if (!info.title.trim()) { setError('Tên truyện không được để trống.'); return; }
    void run(async () => { await updateBook(userId, bookId, changes); load(); }, 'Đã lưu thông tin truyện.');
  };
  const newChapter = () => void run(async () => {
    const { chapterIds } = await addChapters(userId, bookId, [{ title: `Chương ${book.chapters.length + 1}`, content: '' }]);
    router.push({ pathname: '/sang-tac/chuong/[chapterId]', params: { chapterId: chapterIds[0] } });
  });
  const removeChapter = (c: ChapterRow) => Alert.alert(`Xoá “${c.title}”?`, 'Chương nháp sẽ bị xoá hẳn, kèm bình luận và highlight của chương. Không hoàn tác được.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xoá', style: 'destructive', onPress: () => void run(async () => { await deleteChapter(userId, c.id); load(); }, 'Đã xoá chương.') },
  ]);
  const removeBook = () => Alert.alert(`Xoá “${book.title}”?`, 'Tác phẩm sẽ bị ẩn khỏi mọi nơi; nội dung bị dọn sau 30 ngày.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xoá', style: 'destructive', onPress: () => void run(async () => { await deleteBook(userId, bookId); router.replace('/sang-tac'); }) },
  ]);
  const move = (index: number, delta: -1 | 1) => { const next = moveChapter(chapters, index, delta); if (next) setOrder(next); };
  const saveOrder = () => order && void run(async () => { await reorderChapters(userId, bookId, order.map(c => c.id)); load(); }, 'Đã lưu thứ tự chương.');

  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={book.title} onBack={() => router.canGoBack() ? router.back() : router.replace('/sang-tac')} />
        <View className="mb-4 flex-row items-center gap-4">
          <View className="overflow-hidden rounded-md bg-brand-ink" style={{ width: 72, height: 108 }}>
            {book.coverUrl && <Image source={{ uri: book.coverUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} />}
          </View>
          <View className="flex-1">
            <Text className="text-stone">{book.published ? 'Đang ra' : 'Bản nháp'}{book.isExclusive ? ' · Độc quyền' : ' · Tự do'}{book.finalized ? ' · Đã hoàn thiện' : ''}</Text>
            {book.published && <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId } })} className="min-h-11 justify-center">
              <Text className="font-bold text-brand-ink">Xem trang truyện →</Text></Pressable>}
          </View>
        </View>
        <Notice message={error} />
        <Notice message={notice} tone="success" />

        <Text className="mb-2 mt-4 text-lg font-bold text-brand-ink">Chương ({book.chapters.length})</Text>
        {chapters.map((c, i) => <View key={c.id} className="mb-2 flex-row items-center gap-2 rounded-2xl border border-cream-border bg-white p-3">
          <Pressable accessibilityRole="button" disabled={!!order} onPress={() => router.push({ pathname: '/sang-tac/chuong/[chapterId]', params: { chapterId: c.id } })} className="min-h-11 flex-1 justify-center">
            <Text className="font-bold text-brand-ink" numberOfLines={2}>{c.title}</Text>
            <Text className={`text-sm ${c.removed ? 'text-red-700' : 'text-stone'}`}>
              {c.removed ? `Bị quản trị viên gỡ${c.removedReason ? ` — ${c.removedReason}` : ''}` : c.published ? 'Đã đăng' : 'Nháp'}
              {c.price > 0 ? ` · ${c.price} xu` : ' · Miễn phí'}{c.isLastChapter ? ' · Chương cuối' : ''}
            </Text>
          </Pressable>
          {order ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={`Đưa ${c.title} lên`} disabled={!moveChapter(chapters, i, -1)} onPress={() => move(i, -1)}
              style={{ opacity: moveChapter(chapters, i, -1) ? 1 : 0.3 }} className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-cream-border">
              <Text className="text-lg text-brand-ink">↑</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Đưa ${c.title} xuống`} disabled={!moveChapter(chapters, i, 1)} onPress={() => move(i, 1)}
              style={{ opacity: moveChapter(chapters, i, 1) ? 1 : 0.3 }} className="min-h-11 min-w-11 items-center justify-center rounded-xl border border-cream-border">
              <Text className="text-lg text-brand-ink">↓</Text></Pressable>
          </> : canDelete(c) && <Pressable accessibilityRole="button" accessibilityLabel={`Xoá ${c.title}`} disabled={busy} onPress={() => removeChapter(c)}
            className="min-h-11 justify-center px-2"><Text className="text-red-700">Xoá</Text></Pressable>}
        </View>)}
        {order ? <>
          <Button label={busy ? 'Đang lưu…' : 'Lưu thứ tự'} disabled={busy} onPress={saveOrder} />
          <Button label="Hủy sắp xếp" disabled={busy} secondary onPress={() => setOrder(null)} />
        </> : <>
          <Button label={busy ? 'Đang xử lý…' : '+ Chương mới'} disabled={busy} onPress={newChapter} />
          {book.chapters.length > 1 && <Button label="Sắp xếp chương" disabled={busy} secondary onPress={() => setOrder(book.chapters)} />}
        </>}
        <Text className="mt-2 leading-5 text-stone">Chỉ xoá được chương nháp chưa có người mua. Chương cuối luôn đứng cuối.</Text>

        <Text className="mb-3 mt-8 text-lg font-bold text-brand-ink">Thông tin truyện</Text>
        <BookInfoForm value={info} onChange={setInfo} disabled={busy} exclusivityLocked={book.exclusivityLocked} />
        <Button label={busy ? 'Đang lưu…' : 'Lưu thông tin'} disabled={busy || !dirty} onPress={saveInfo} />
        {dirty && <Button label="Bỏ thay đổi" disabled={busy} secondary onPress={() => setInfo(original)} />}

        {!(book.published && book.isExclusive) && <Pressable accessibilityRole="button" disabled={busy} onPress={removeBook} className="mt-8 min-h-12 items-center justify-center">
          <Text className="font-bold text-red-700">Xoá tác phẩm</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
