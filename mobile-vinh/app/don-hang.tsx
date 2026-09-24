import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Notice, ScreenHeader } from '../src/components/Form';
import { OrderRow } from '../src/components/OrderSummary';
import { listOrders, type Order } from '../src/services/orders';

type Filter = 'all' | 'buyer' | 'seller';
const FILTERS: [Filter, string][] = [['all', 'Tất cả'], ['buyer', 'Tôi đặt'], ['seller', 'Tôi nhận']];

export default function Orders() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Đơn hàng" onBack={() => router.back()} />
    <Text className="mb-2 leading-7 text-stone">Đăng nhập để xem đơn hàng của bạn.</Text>
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <OrderList key={session.user.id} userId={session.user.id} />;
}

function OrderList({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (pull = false) => {
    const request = ++sequence.current;
    if (pull) setRefreshing(true);
    setError('');
    try { const next = await listOrders(userId); if (request === sequence.current) setOrders(next); }
    catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được đơn hàng.'); }
    finally { if (request === sequence.current) setRefreshing(false); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const shown = (orders ?? []).filter(o => filter === 'all' || o.role === filter);
  return <SafeAreaView className="flex-1 bg-cream-card">
    <FlatList data={shown} keyExtractor={o => o.id} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}
      ListHeaderComponent={<>
        <ScreenHeader title="Đơn hàng của tôi" onBack={() => router.back()} />
        <View className="mb-4 flex-row gap-2">
          {FILTERS.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }}
            onPress={() => setFilter(value)} className={`min-h-12 flex-1 items-center justify-center rounded-xl border border-cream-border ${filter === value ? 'bg-brand-ink' : 'bg-white'}`}>
            <Text className={filter === value ? 'font-bold text-white' : 'text-brand-ink'}>{label}</Text>
          </Pressable>)}
        </View>
        <Notice message={error} />
        {!orders && !error && <ActivityIndicator color="#143b4d" style={{ marginTop: 24 }} />}
      </>}
      ListEmptyComponent={orders ? <Text className="leading-6 text-stone">
        {filter === 'seller' ? 'Chưa có đơn nào bạn nhận thực hiện.' : 'Chưa có đơn hàng. Đơn được tạo khi đặt một dịch vụ trên Vịnh.'}</Text> : null}
      renderItem={({ item }) => <OrderRow order={item} />} />
  </SafeAreaView>;
}
