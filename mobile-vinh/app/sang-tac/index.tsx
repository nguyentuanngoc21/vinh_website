import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { listMyBooks, type MyBook } from '../../src/services/authoring';

// The web /author sidebar: the caller's own works, drafts included, newest first.
export default function MyWorks() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Works key={session?.user.id ?? 'guest'} userId={session?.user.id} />;
}

function Works({ userId }: { userId?: string }) {
  const [books, setBooks] = useState<MyBook[] | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(() => {
    const request = ++sequence.current;
    if (userId) {
      setError('');
      listMyBooks(userId).then(list => { if (request === sequence.current) setBooks(list); })
        .catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được tác phẩm.'); });
    }
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);

  return <SafeAreaView className="flex-1 bg-cream-card">
    <View className="px-5 pt-2">
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/ca-nhan')} className="min-h-12 justify-center">
        <Text className="text-brand-ink">← Quay lại</Text></Pressable>
      <Text accessibilityRole="header" className="mb-2 text-2xl font-bold text-brand-ink">Sáng tác của tôi</Text>
      {!!userId && <Pressable accessibilityRole="button" onPress={() => router.push('/sang-tac/moi')} className="mb-3 min-h-12 items-center justify-center rounded-2xl bg-brand-ink p-4">
        <Text className="font-bold text-white">+ Tác phẩm mới</Text></Pressable>}
      {!!userId && <Pressable accessibilityRole="button" onPress={() => router.push('/sang-tac/nhap')} className="mb-3 min-h-12 items-center justify-center rounded-2xl border border-brand-ink p-4">
        <Text className="font-bold text-brand-ink">Nhập bản thảo thành truyện mới</Text></Pressable>}
      {!!error && <Text accessibilityLiveRegion="polite" className="mb-2 text-red-700">{error}</Text>}
    </View>
    {!userId ? <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để sáng tác →</Text></Pressable>
      : !books && !error ? <ActivityIndicator color="#143b4d" />
      : <FlatList data={books ?? []} keyExtractor={b => b.id} contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        onRefresh={load} refreshing={false}
        ListEmptyComponent={!error ? <Text className="leading-6 text-stone">Bạn chưa có tác phẩm nào. Bấm “+ Tác phẩm mới” để bắt đầu viết.</Text> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/sang-tac/[bookId]', params: { bookId: item.id } })}
          className="mb-3 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-3">
          <View className="overflow-hidden rounded-md bg-brand-ink" style={{ width: 52, height: 78 }}>
            {item.coverUrl && <Image source={{ uri: item.coverUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} />}
          </View>
          <View className="flex-1">
            <Text className="font-bold text-brand-ink" numberOfLines={2}>{item.title}</Text>
            <Text className="mt-1 text-sm text-stone">{item.chapterCount} chương · {item.publishedCount} đã đăng · {item.published ? 'Đang ra' : 'Bản nháp'}</Text>
            <Text className="text-sm text-stone">{item.genre ?? 'Chưa chọn thể loại'}{item.isExclusive ? ' · Độc quyền' : ''}</Text>
          </View>
        </Pressable>} />}
  </SafeAreaView>;
}
