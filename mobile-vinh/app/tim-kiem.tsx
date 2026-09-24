import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Book, searchBooks, SEARCH_PAGE_SIZE } from '../src/services/books';

export default function Search() {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const sequence = useRef(0);
  const offset = useRef(0);
  const busy = useRef(false);
  useEffect(() => () => { sequence.current++; }, []);
  function change(value: string) {
    sequence.current++; busy.current = false;
    setText(value); setTerm(''); setItems([]); setMore(false); setError(''); setLoading(false);
  }
  async function search(append = false) {
    if (busy.current) return;
    const query = text.trim();
    const request = ++sequence.current;
    busy.current = true; setLoading(true); setError(''); setTerm(query);
    if (!append) { setItems([]); setMore(false); offset.current = 0; }
    try {
      const data = await searchBooks(query, append ? offset.current : 0);
      if (request !== sequence.current) return;
      setItems(old => append ? [...old, ...data.filter(book => !old.some(b => b.id === book.id))] : data);
      offset.current += data.length; setMore(data.length === SEARCH_PAGE_SIZE);
    } catch (e) {
      if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không thể kết nối.');
    } finally {
      if (request === sequence.current) { busy.current = false; setLoading(false); }
    }
  }
  return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="px-6 py-4">
      <Text className="text-base text-brand-ink">← Quay lại</Text>
    </Pressable>
    <View className="px-6 pb-4">
      <Text accessibilityRole="header" className="mb-4 text-3xl font-bold text-brand-ink">Tìm truyện</Text>
      <TextInput accessibilityLabel="Tên truyện cần tìm" value={text} onChangeText={change} maxLength={120}
        placeholder="Nhập tên truyện…" placeholderTextColor="#8a8178" returnKeyType="search"
        onSubmitEditing={() => void search()} className="mb-3 rounded-2xl border border-cream-border bg-white p-4 text-base text-brand-ink" />
      <Pressable accessibilityRole="button" disabled={loading || !text.trim()} onPress={() => void search()}
        style={{ opacity: loading || !text.trim() ? 0.5 : 1 }} className="items-center rounded-2xl bg-brand-ink p-4">
        <Text className="font-bold text-white">{loading ? 'Đang tìm…' : 'Tìm kiếm'}</Text>
      </Pressable>
    </View>
    <FlatList data={items} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
      ListHeaderComponent={<>
        {!!term && <Text className="mb-4 text-stone">Kết quả cho “{term}” · mới nhất trước</Text>}
        {!!error && <Text accessibilityLiveRegion="polite" className="mb-4 text-red-700">{error}</Text>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <Text className="py-8 text-center leading-6 text-stone">
        {term ? 'Chưa tìm thấy truyện phù hợp.' : 'Tìm theo tên trong toàn bộ truyện đã xuất bản. Hãy nhập đúng dấu tiếng Việt để có kết quả phù hợp.'}
      </Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId: item.id } })}
        className="mb-3 rounded-2xl border border-cream-border p-5">
        <Text className="mb-2 text-lg font-bold text-brand-ink">{item.title}</Text>
        <Text className="mb-2 text-sm text-stone">{item.genre || 'Truyện'} · {item.view_count.toLocaleString('vi')} lượt xem</Text>
        {!!item.synopsis && <Text numberOfLines={2} className="leading-6 text-stone">{item.synopsis}</Text>}
      </Pressable>}
      ListFooterComponent={more ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search(true)} className="items-center py-5">
        <Text className="font-bold text-brand-ink">{loading ? 'Đang tải…' : 'Tải thêm kết quả'}</Text>
      </Pressable> : null} />
  </SafeAreaView>;
}
