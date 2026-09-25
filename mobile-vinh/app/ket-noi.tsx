import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Notice, ScreenHeader } from '../src/components/Form';
import { Avatar } from '../src/components/Avatar';
import { FILTERS, filterPeople, getDirectory, tagsOf, type Person } from '../src/services/connect';

export default function Connect() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Kết nối" onBack={() => router.back()} />
    <Text className="mb-2 leading-7 text-stone">Đăng nhập để tìm tác giả, họa sĩ, người lồng tiếng và đặt dịch vụ.</Text>
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <Directory key={session.user.id} userId={session.user.id} />;
}

function Directory({ userId }: { userId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [filter, setFilter] = useState<string>('Tất cả');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const request = ++sequence.current;
    if (refresh) setRefreshing(true);
    setError('');
    try { const next = await getDirectory(userId, refresh); if (request === sequence.current) setPeople(next); }
    catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được danh bạ.'); }
    finally { if (request === sequence.current) setRefreshing(false); }
  }, [userId]);
  // Follow changes made on a profile update the shared cache, so a cached reload is enough on focus.
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const shown = useMemo(() => filterPeople(people ?? [], filter, query), [people, filter, query]);

  return <SafeAreaView className="flex-1 bg-cream-card">
    <FlatList data={shown} keyExtractor={p => p.id} contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}
      ListHeaderComponent={<>
        <ScreenHeader title="Kết nối" onBack={() => router.back()} />
        <TextInput accessibilityLabel="Tìm theo tên hoặc tên tài khoản" value={query} onChangeText={setQuery} placeholder="Tìm theo tên hoặc @tài khoản"
          placeholderTextColor="#8a8178" autoCapitalize="none" autoCorrect={false}
          className="mb-3 rounded-xl border border-cream-border bg-white px-4 py-3 text-base text-brand-ink" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)}
            className={`min-h-12 justify-center rounded-full border px-4 ${filter === f ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
            <Text className={filter === f ? 'font-bold text-white' : 'text-brand-ink'}>{f}</Text></Pressable>)}
        </ScrollView>
        <Notice message={error} />
        {!people && !error && <ActivityIndicator color="#143b4d" style={{ marginTop: 24 }} />}
      </>}
      ListEmptyComponent={people ? <Text className="leading-6 text-stone">Không tìm thấy người phù hợp.</Text> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Xem hồ sơ ${item.nickname}`}
        onPress={() => router.push({ pathname: '/nguoi-dung/[userId]', params: { userId: item.id } })}
        className="mb-3 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-4">
        <Avatar person={item} />
        <View className="flex-1">
          <Text className="text-base font-bold text-brand-ink">{item.nickname}</Text>
          <Text className="text-sm text-stone">@{item.username} · {item.followerCount} người theo dõi</Text>
          <Text className="mt-1 text-sm text-brand-ink">{tagsOf(item).join(' · ')}{item.services.length ? ` · ${item.services.length} dịch vụ` : ''}</Text>
        </View>
      </Pressable>} />
  </SafeAreaView>;
}
