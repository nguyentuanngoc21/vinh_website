import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { getNotifications, markNotificationRead, Notification } from '../src/services/notifications';
import { notificationChat } from '../src/services/notification-link';

export default function Notifications() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Inbox key={session?.user.id ?? 'guest'} userId={session?.user.id} />;
}
function Inbox({ userId }: { userId?: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const writeLock = useRef(false);
  const load = useCallback(() => {
    const request = ++sequence.current;
    if (userId) {
      setLoading(true); setError('');
      getNotifications(userId).then(data => { if (sequence.current === request) setItems(data); })
        .catch(e => { if (sequence.current === request) setError(e instanceof Error ? e.message : 'Không thể kết nối.'); })
        .finally(() => { if (sequence.current === request) setLoading(false); });
    }
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);
  async function mark(id: string) {
    if (!userId || writeLock.current || loading) return;
    writeLock.current = true; setBusy(id); setError('');
    const request = sequence.current;
    try {
      const result = await markNotificationRead(userId, id);
      if (sequence.current !== request) return;
      if (result) setItems(old => old.map(item => item.id === result.id ? { ...item, read_at: result.read_at } : item));
      else load();
    } catch (e) {
      if (sequence.current === request) setError(e instanceof Error ? e.message : 'Không cập nhật được thông báo.');
    } finally {
      writeLock.current = false;
      // This screen may have blurred during the write. Clear busy when it is rendered again.
      setBusy(null);
    }
  }
  return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="px-6 py-4">
      <Text className="text-base text-brand-ink">← Quay lại</Text>
    </Pressable>
    {!userId ? <View className="p-6">
      <Text className="mb-5 text-xl font-bold text-brand-ink">Đăng nhập để xem thông báo</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="rounded-xl bg-brand-ink p-4">
        <Text className="text-center text-white">Đăng nhập</Text>
      </Pressable>
    </View> : <FlatList data={items} keyExtractor={item => item.id} refreshing={loading}
      onRefresh={() => { if (!writeLock.current) load(); }} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      ListHeaderComponent={<>
        <Text accessibilityRole="header" className="mb-3 text-3xl font-bold text-brand-ink">Thông báo</Text>
        <Text className="mb-5 leading-6 text-stone">30 thông báo mới nhất · {items.filter(item => !item.read_at).length} chưa đọc trong danh sách</Text>
        {!!error && <View className="mb-5"><Text accessibilityLiveRegion="polite" className="mb-3 text-red-700">{error}</Text>
          <Pressable accessibilityRole="button" disabled={!!busy || loading} onPress={() => { load(); }} className="py-3"><Text className="font-bold text-brand-ink">Thử lại</Text></Pressable></View>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <Text className="py-8 text-center text-stone">Bạn chưa có thông báo nào.</Text> : null}
      renderItem={({ item }) => <View className="mb-4 rounded-2xl border border-cream-border p-5">
        <Text className={`mb-3 text-base leading-6 text-brand-ink ${!item.read_at ? 'font-bold' : ''}`}>{item.title}</Text>
        <Text className="mb-3 text-sm text-stone">{new Date(item.created_at).toLocaleString('vi-VN')} · {item.read_at ? 'Đã đọc' : 'Chưa đọc'}</Text>
        {notificationChat(item.link) ? <Pressable accessibilityRole="button" onPress={() => {
          const params = notificationChat(item.link);
          if (params) router.push({ pathname: '/tin-nhan', params });
        }} className="py-3"><Text className="font-bold text-brand-ink">Mở hội thoại →</Text></Pressable>
          : !!item.link && <Text className="mb-3 text-sm leading-6 text-stone">Xem nội dung liên quan trong mục Thông báo trên website Vịnh.</Text>}
        {!item.read_at && <Pressable accessibilityRole="button" disabled={!!busy || loading} onPress={() => void mark(item.id)} className="py-3">
          <Text className="font-bold text-brand-ink">{busy === item.id ? 'Đang lưu…' : 'Đánh dấu đã đọc'}</Text>
        </Pressable>}
      </View>} />}
  </SafeAreaView>;
}
