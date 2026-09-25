import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Notice, ScreenHeader } from '../src/components/Form';
import { getRankings, PERIODS, type PeriodId, type RankingPeriod } from '../src/services/discover';

// Real "Truyện chữ" rankings from the web /rankings (reads per period; all-time by views).
export default function Rankings() {
  const [data, setData] = useState<Record<PeriodId, RankingPeriod> | null>(null);
  const [period, setPeriod] = useState<PeriodId>('tuan');
  const [genre, setGenre] = useState('Tất cả');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    setError('');
    try { setData(await getRankings()); } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được bảng xếp hạng.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    let active = true;
    getRankings().then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được bảng xếp hạng.'); });
    return () => { active = false; };
  }, []);
  const current = data?.[period];
  const genres = useMemo(() => ['Tất cả', ...new Set((current?.list ?? []).map(b => b.genre).filter((g): g is string => !!g))], [current]);
  const list = (current?.list ?? []).filter(b => genre === 'Tất cả' || b.genre === genre);
  const chip = (label: string, selected: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button"
    accessibilityState={{ selected }} onPress={onPress}
    className={`min-h-12 justify-center rounded-full border px-4 ${selected ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
    <Text className={selected ? 'font-bold text-white' : 'text-brand-ink'}>{label}</Text></Pressable>;

  return <SafeAreaView className="flex-1 bg-cream-card">
    <FlatList data={list} keyExtractor={b => b.id} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}
      ListHeaderComponent={<>
        <ScreenHeader title="Bảng xếp hạng" onBack={() => router.back()} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {PERIODS.map(([id, label]) => chip(label, period === id, () => { setPeriod(id); setGenre('Tất cả'); }))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {genres.map(g => chip(g, genre === g, () => setGenre(g)))}
        </ScrollView>
        {!!current && <Text className="mb-3 text-sm text-stone">{current.range} · {period === 'toanthoigian' ? 'theo lượt xem' : 'theo lượt đọc hết chương'}</Text>}
        <Notice message={error} />
        {!data && !error && <ActivityIndicator color="#143b4d" style={{ marginTop: 24 }} />}
      </>}
      ListEmptyComponent={data ? <Text className="text-stone">Chưa có truyện trong bảng xếp hạng này.</Text> : null}
      renderItem={({ item, index }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId: item.id } })}
        className="mb-3 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-3">
        <Text className="w-8 text-center text-xl font-bold text-brand-ink">{index + 1}</Text>
        <View className="overflow-hidden rounded-md bg-brand-ink" style={{ width: 46, height: 66 }}>
          {item.coverUrl && <Image source={{ uri: item.coverUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} />}
        </View>
        <View className="flex-1">
          <Text numberOfLines={2} className="font-bold text-brand-ink">{item.title}{item.isNew ? '  · MỚI' : ''}</Text>
          <Text numberOfLines={1} className="text-xs text-stone">{item.authorNickname ?? 'Tác giả'} · {item.genre ?? 'Truyện'}</Text>
          <Text className="text-xs text-stone">{period === 'toanthoigian' ? `${item.viewCount.toLocaleString('vi')} lượt xem` : `${item.reads.toLocaleString('vi')} lượt đọc`}
            {item.delta ? ` · ${item.delta > 0 ? '▲' : '▼'} ${Math.abs(item.delta)}` : ''}</Text>
        </View>
      </Pressable>} />
  </SafeAreaView>;
}
