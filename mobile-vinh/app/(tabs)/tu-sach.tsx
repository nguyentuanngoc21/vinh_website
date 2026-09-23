import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { getLibrary, LibraryEntry, openLibraryBook } from '../../src/services/library';
import { SaveBook } from '../../src/components/SaveBook';

export default function Library() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session) return <SafeAreaView className="flex-1 justify-center bg-cream-card px-8">
    <Text className="mb-4 text-3xl font-bold text-brand-ink">Tủ sách của bạn</Text>
    <Text className="mb-6 text-base leading-7 text-stone">Đăng nhập để lưu truyện và tiếp tục đọc trên các thiết bị của bạn.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="rounded-2xl bg-brand-ink p-4"><Text className="text-center font-bold text-white">Đăng nhập</Text></Pressable>
  </SafeAreaView>;
  return <UserLibrary key={session.user.id} userId={session.user.id} />;
}
function UserLibrary({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [mode, setMode] = useState<'reading' | 'saved'>('reading');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const request = useRef(0);
  const openLock = useRef(false);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true); setError('');
    try { const data = await getLibrary(userId); if (version === request.current) setEntries(data); }
    catch (e) { if (version === request.current) setError(e instanceof Error ? e.message : 'Không tải được Tủ sách.'); }
    finally { if (version === request.current) setLoading(false); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  async function open(entry: LibraryEntry) {
    if (openLock.current) return;
    openLock.current = true; setOpening(entry.book.id); setError('');
    try { router.push({ pathname: '/doc/[chapterId]', params: { chapterId: await openLibraryBook(userId, entry.book.id) } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không mở được truyện.'); }
    finally { openLock.current = false; setOpening(null); }
  }
  const filtered = entries.filter(e => mode === 'reading' ? !!e.progress : !!e.lists.length);
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-cream-card">
    <FlatList data={filtered} keyExtractor={e => e.book.id} refreshing={loading} onRefresh={load}
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }} ListHeaderComponent={<>
        <Text className="mb-3 text-sm tracking-widest text-stone">VỊNH · DÀNH RIÊNG CHO BẠN</Text>
        <Text className="mb-3 text-3xl font-bold text-brand-ink">Tủ sách</Text>
        <Text className="mb-6 leading-6 text-stone">Những câu chuyện bạn muốn giữ lại, những trang đang đợi bạn đọc tiếp.</Text>
        <View className="mb-6 flex-row gap-3">{(['reading', 'saved'] as const).map(tab => <Pressable key={tab} accessibilityRole="button" accessibilityState={{ selected: mode === tab }} onPress={() => setMode(tab)}
          className={`flex-1 items-center rounded-full border border-cream-border p-4 ${mode === tab ? 'bg-brand-ink' : 'bg-cream-card'}`}>
          <Text className={mode === tab ? 'text-white' : 'text-brand-ink'}>{tab === 'reading' ? 'Đang đọc' : 'Đã lưu'}</Text></Pressable>)}</View>
        {!!error && <View className="mb-5 rounded-xl bg-white p-4"><Text accessibilityLiveRegion="polite" className="mb-2 text-red-700">{error}</Text>
          <Pressable onPress={load} className="py-2"><Text className="font-bold text-brand-ink">Thử lại</Text></Pressable></View>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <View className="py-10">
        <Text className="mb-5 text-center leading-7 text-stone">{mode === 'reading' ? 'Chưa có truyện đang đọc. Mở một chương và bắt đầu đọc để lưu vị trí.' : 'Chưa có truyện đã lưu. Bấm “Lưu truyện” trong màn hình đọc để thêm vào danh sách.'}</Text>
        <Pressable onPress={() => router.push('/')} className="p-4"><Text className="text-center font-bold text-brand-ink">Khám phá truyện →</Text></Pressable></View> : null}
      renderItem={({ item }) => <View className="mb-4 rounded-2xl border border-cream-border p-5">
        <Text className="mb-2 text-xs text-stone">{item.book.genre || 'Truyện'}</Text>
        <Text className="mb-3 text-xl font-bold text-brand-ink">{item.book.title}</Text>
        {item.progress && <Text className="mb-2 text-sm text-stone">Đã đọc đến đoạn {(item.progress.last_paragraph_index ?? 0) + 1} · {new Date(item.progress.updated_at).toLocaleDateString('vi-VN')}</Text>}
        {!!item.lists.length && <Text className="mb-3 text-sm text-stone">{item.lists.map(l => l.name).join(' · ')}</Text>}
        <View className="flex-row flex-wrap items-center justify-between">
          <Pressable accessibilityRole="button" disabled={!!opening} onPress={() => void open(item)} className="py-4 pr-4">
            <Text className="font-bold text-brand-ink">{opening === item.book.id ? 'Đang mở…' : item.progress ? 'Tiếp tục đọc →' : 'Bắt đầu đọc →'}</Text></Pressable>
          <SaveBook bookId={item.book.id} onClose={() => void load()} />
        </View>
      </View>} />
  </SafeAreaView>;
}
