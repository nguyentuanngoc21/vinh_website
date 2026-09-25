import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { useAudio } from '../src/providers/AudioProvider';
import { searchAll, type AudioResult, type BookResult, type DesignResult } from '../src/services/discover';

type Tab = 'truyen' | 'audio' | 'thiet-ke';
const TABS: [Tab, string][] = [['truyen', 'Truyện'], ['audio', 'Audio'], ['thiet-ke', 'Thiết kế']];
type Results = { books: BookResult[]; audio: AudioResult[]; designs: DesignResult[] };

// Same search as the web /tim-kiem: title or creator nickname, three tabs, up to 24 results each.
export default function Search() {
  const { session } = useAuth();
  const audio = useAudio();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<Tab>('truyen');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function search() {
    const query = text.trim();
    if (!query) return;
    const request = ++sequence.current;
    setLoading(true); setError(''); setTerm(query);
    try { const next = await searchAll(query); if (request === sequence.current) setResults(next); }
    catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không thể kết nối.'); }
    finally { if (request === sequence.current) setLoading(false); }
  }
  const counts: Record<Tab, number> = { truyen: results?.books.length ?? 0, audio: results?.audio.length ?? 0, 'thiet-ke': results?.designs.length ?? 0 };
  const tracks = (results?.audio ?? []).filter(a => a.audioUrl).map(a => ({ id: a.id, title: a.title, narratorName: a.narratorNickname ?? '',
    genre: null, durationSeconds: a.durationSeconds, playCount: 0, audioUrl: a.audioUrl as string }));
  const data: (BookResult | AudioResult | DesignResult)[] = tab === 'truyen' ? results?.books ?? [] : tab === 'audio' ? results?.audio ?? [] : results?.designs ?? [];

  return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="px-6 py-4">
      <Text className="text-base text-brand-ink">← Quay lại</Text>
    </Pressable>
    <View className="px-6 pb-2">
      <Text accessibilityRole="header" className="mb-4 text-3xl font-bold text-brand-ink">Tìm kiếm</Text>
      <TextInput accessibilityLabel="Từ khóa tìm kiếm" value={text} onChangeText={setText} maxLength={100}
        placeholder="Tên truyện, tác giả, audio, thiết kế…" placeholderTextColor="#8a8178" returnKeyType="search"
        onSubmitEditing={() => void search()} className="mb-3 rounded-2xl border border-cream-border bg-white p-4 text-base text-brand-ink" />
      <Pressable accessibilityRole="button" disabled={loading || !text.trim()} onPress={() => void search()}
        style={{ opacity: loading || !text.trim() ? 0.5 : 1 }} className="items-center rounded-2xl bg-brand-ink p-4">
        <Text className="font-bold text-white">{loading ? 'Đang tìm…' : 'Tìm kiếm'}</Text>
      </Pressable>
      {results && <View className="mt-4 flex-row gap-2">
        {TABS.map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)}
          className={`min-h-12 flex-1 items-center justify-center rounded-xl border border-cream-border ${tab === id ? 'bg-brand-ink' : 'bg-white'}`}>
          <Text className={tab === id ? 'font-bold text-white' : 'text-brand-ink'}>{label} · {counts[id]}</Text></Pressable>)}
      </View>}
    </View>
    <FlatList data={data} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
      ListHeaderComponent={<>
        {!!term && <Text className="mb-4 text-stone">Kết quả cho “{term}”</Text>}
        {!!error && <Text accessibilityLiveRegion="polite" className="mb-4 text-red-700">{error}</Text>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <Text className="py-8 text-center leading-6 text-stone">
        {term ? 'Chưa tìm thấy kết quả phù hợp.' : 'Tìm theo tên tác phẩm hoặc tên người sáng tác. Hãy nhập đúng dấu tiếng Việt để có kết quả phù hợp.'}
      </Text> : null}
      renderItem={({ item }) => {
        if (tab === 'truyen') {
          const b = item as BookResult;
          return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId: b.id } })}
            className="mb-3 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-3">
            <View className="overflow-hidden rounded-md bg-brand-ink" style={{ width: 46, height: 66 }}>
              {b.coverUrl && <Image source={{ uri: b.coverUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} />}
            </View>
            <View className="flex-1"><Text className="font-bold text-brand-ink">{b.title}</Text>
              <Text className="text-sm text-stone">{b.authorNickname ?? 'Tác giả'} · {b.genre ?? 'Truyện'}</Text></View>
          </Pressable>;
        }
        if (tab === 'audio') {
          const a = item as AudioResult;
          const track = tracks.find(t => t.id === a.id);
          return <Pressable accessibilityRole="button" disabled={!track} onPress={() => {
            if (!session) { router.push('/(tabs)/ca-nhan'); return; }
            if (track) { void audio.play(track, tracks); router.push('/audio/player'); }
          }} className="mb-3 rounded-2xl border border-cream-border bg-white p-4">
            <Text className="font-bold text-brand-ink">▶ {a.title}</Text>
            <Text className="text-sm text-stone">{a.narratorNickname ?? 'Người lồng tiếng'}{session ? '' : ' · đăng nhập để nghe'}</Text>
          </Pressable>;
        }
        const d = item as DesignResult;
        return <View className="mb-3 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-3">
          <View className="overflow-hidden rounded-md bg-cream" style={{ width: 66, height: 66 }}>
            {d.imageUrl && <Image source={{ uri: d.imageUrl }} accessibilityLabel={d.title} style={{ width: '100%', height: '100%' }} />}
          </View>
          <View className="flex-1"><Text className="font-bold text-brand-ink">{d.title}</Text>
            <Text className="text-sm text-stone">{d.illustratorNickname ?? 'Họa sĩ'}{d.category ? ` · ${d.category}` : ''}</Text></View>
        </View>;
      }} />
  </SafeAreaView>;
}
