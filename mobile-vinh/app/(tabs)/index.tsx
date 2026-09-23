import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Book, getBooks, getFirstChapter } from '../../src/services/books';
import { openLibraryBook } from '../../src/services/library';
import { useAuth } from '../../src/providers/AuthProvider';

export default function Home() {
  const { session } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Tất cả');
  const [opening, setOpening] = useState<string | null>(null);
  const openingRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setBooks(await getBooks()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    getBooks().then(data => { if (active) setBooks(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không thể kết nối.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const genres = ['Tất cả', ...new Set(books.map(b => b.genre).filter((g): g is NonNullable<typeof g> => !!g))];
  const filtered = useMemo(() => books.filter(b => (genre === 'Tất cả' || b.genre === genre)
    && b.title.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))), [books, genre, search]);
  const newest = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  async function open(book: Book) {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(book.id);
    try { router.push({ pathname: '/doc/[chapterId]', params: {
      chapterId: session ? await openLibraryBook(session.user.id, book.id) : await getFirstChapter(book.id),
    } }); }
    catch (e) { Alert.alert('Chưa thể mở truyện', e instanceof Error ? e.message : 'Vui lòng thử lại.'); }
    finally { openingRef.current = false; setOpening(null); }
  }
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-cream-card">
    <StatusBar style="dark" />
    <FlatList data={newest} keyExtractor={b => b.id} refreshing={loading} onRefresh={load}
      contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
      ListHeaderComponent={<>
        <View className="mb-7 flex-row items-center justify-between">
          <Text className="text-4xl font-bold text-brand-ink">vịnh<Text className="text-brand-gold">.</Text></Text>
          <Text className="text-xs tracking-widest text-stone">MỘT CHỐN ĐỂ ĐẮM MÌNH</Text>
        </View>
        <Text className="mb-2 text-sm text-stone">Chào bạn,</Text>
        <Text className="mb-6 text-3xl font-bold leading-10 text-brand-ink">Hôm nay, mình đọc gì?</Text>
        <TextInput accessibilityLabel="Tìm tên truyện" placeholder="Tìm một câu chuyện…" placeholderTextColor="#8a8178"
          value={search} onChangeText={setSearch} className="mb-5 rounded-2xl border border-cream-border bg-white px-5 py-4 text-base text-brand-ink" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
          {genres.map(g => <Pressable key={g} accessibilityRole="button" accessibilityState={{ selected: genre === g }} onPress={() => setGenre(g)}
            className={`rounded-full border border-cream-border px-5 py-3 ${genre === g ? 'bg-brand-ink' : 'bg-cream-card'}`}>
            <Text className={genre === g ? 'text-white' : 'text-brand-ink'}>{g}</Text>
          </Pressable>)}
        </ScrollView>
        {!!error && <View accessibilityLiveRegion="polite" className="mb-5 rounded-2xl bg-cream p-5">
          <Text className="mb-3 text-brand-ink">{error}</Text>
          <Pressable accessibilityRole="button" onPress={load}><Text className="font-bold text-brand-ink">Thử lại ↻</Text></Pressable>
        </View>}
        {loading && !books.length && <ActivityIndicator color="#143b4d" style={{ margin: 24 }} />}
        {!!filtered.length && <>
          <Text className="mb-4 text-xl font-bold text-brand-ink">Được đọc nhiều</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 26 }}>
            {filtered.slice(0, 6).map((book, index) => <Pressable key={book.id} accessibilityRole="button" accessibilityLabel={`Đọc ${book.title}`}
              disabled={!!opening} onPress={() => open(book)} style={{ width: 270, minHeight: 270 }} className="justify-between rounded-3xl bg-brand-ink p-6">
              <Text className="mb-6 text-xs tracking-widest text-brand-gold">VỊNH TUYỂN CHỌN · 0{index + 1}</Text>
              <Text numberOfLines={3} className="mb-4 text-3xl font-bold text-cream-card">{book.title}</Text>
              <Text numberOfLines={2} className="mb-6 text-sm leading-6 text-cream">{book.synopsis || book.genre || 'Một câu chuyện đang chờ bạn khám phá.'}</Text>
              <Text className="font-bold text-brand-gold">{opening === book.id ? 'Đang mở…' : 'Bắt đầu đọc →'}</Text>
            </Pressable>)}
          </ScrollView>
          <View className="mb-4 flex-row items-center justify-between"><Text className="text-xl font-bold text-brand-ink">Mới xuất bản</Text>
            <Text className="text-xs text-stone">{filtered.length} truyện</Text></View>
        </>}
      </>}
      ListEmptyComponent={!loading && !error ? <Text className="py-8 text-center text-stone">Chưa tìm thấy truyện phù hợp.</Text> : null}
      renderItem={({ item, index }) => <Pressable accessibilityRole="button" disabled={!!opening} onPress={() => open(item)}
        className="mb-3 flex-row items-center rounded-2xl border border-cream-border p-4">
        <View className="mr-4 h-20 w-14 items-center justify-center rounded-lg bg-brand-ink"><Text className="text-xl text-brand-gold">{String(index + 1).padStart(2, '0')}</Text></View>
        <View className="flex-1"><Text numberOfLines={2} className="mb-2 text-base font-bold text-brand-ink">{item.title}</Text>
          <Text className="text-xs text-stone">{item.genre || 'Truyện'} · {item.view_count.toLocaleString('vi')} lượt xem</Text></View>
        <Text className="ml-3 text-xl text-brand-ink">{opening === item.id ? '…' : '→'}</Text>
      </Pressable>} />
  </SafeAreaView>;
}
