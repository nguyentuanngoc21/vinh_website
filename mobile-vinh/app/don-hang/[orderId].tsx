import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../src/providers/AuthProvider';
import { Button, Notice, ScreenHeader } from '../../src/components/Form';
import { StatusPill } from '../../src/components/OrderSummary';
import {
  depositAmount, eventLabel, formatDateTime, getOrder, getOrderAssets, getOrderEvents, partyName, paymentDue,
  SCOPE_LABELS, SERVICE_LABELS, type Order, type OrderAsset, type OrderEvent,
} from '../../src/services/orders';

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Đơn hàng" onBack={() => router.back()} />
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <Detail key={`${session.user.id}:${orderId}`} userId={session.user.id} orderId={orderId} />;
}

const xu = (n: number) => `${n.toLocaleString('vi-VN')} xu`;
function Line({ label, value }: { label: string; value: string }) {
  return <View className="flex-row justify-between gap-4 border-b border-cream-border py-3">
    <Text className="text-stone">{label}</Text>
    <Text className="flex-1 text-right font-bold text-brand-ink">{value}</Text>
  </View>;
}

function Detail({ userId, orderId }: { userId: string; orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [assets, setAssets] = useState<OrderAsset[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [assetError, setAssetError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (pull = false) => {
    const request = ++sequence.current;
    if (pull) setRefreshing(true);
    setError('');
    try {
      const next = await getOrder(userId, orderId);
      if (request !== sequence.current) return;
      setOrder(next);
      // Timeline and deliverables are secondary: show the order even if they fail.
      const [nextEvents, nextAssets] = await Promise.allSettled([getOrderEvents(userId, orderId),
        next.status === 'delivered' || next.status === 'completed' || next.status === 'disputed' ? getOrderAssets(userId, orderId) : Promise.resolve([])]);
      if (request !== sequence.current) return;
      if (nextEvents.status === 'fulfilled') setEvents(nextEvents.value);
      if (nextAssets.status === 'fulfilled') { setAssets(nextAssets.value); setAssetError(''); }
      else setAssetError('Không tải được sản phẩm bàn giao. Kéo xuống để thử lại.');
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được đơn hàng.'); }
    finally { if (request === sequence.current) setRefreshing(false); }
  }, [userId, orderId]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));

  if (!order) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Đơn hàng" onBack={() => router.back()} />
    {error ? <><Notice message={error} /><Button label="Thử lại" secondary onPress={() => void load()} /></> : <ActivityIndicator color="#143b4d" />}
  </SafeAreaView>;

  const due = paymentDue(order);
  const service = order.service_listings;
  const web = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  return <SafeAreaView className="flex-1 bg-cream-card">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}>
      <ScreenHeader title={`Đơn ${order.code}`} onBack={() => router.back()} />
      <StatusPill status={order.status} />
      <Text className="mt-3 text-xl font-bold text-brand-ink">{service?.name || SERVICE_LABELS[service?.service_type ?? ''] || 'Dịch vụ'}</Text>
      <Text className="mt-1 text-stone">{SERVICE_LABELS[service?.service_type ?? ''] ?? 'Dịch vụ'} · {order.role === 'buyer' ? 'Bạn là người đặt' : 'Bạn là người thực hiện'}</Text>
      <Button label={`Nhắn tin với ${partyName(order)} →`} secondary
        onPress={() => router.push({ pathname: '/tin-nhan', params: { chat: order.counterpart.id } })} />

      {due && <View className="mt-5 rounded-2xl border border-brand-gold bg-white p-4">
        <Text className="font-bold text-brand-ink">Cần thanh toán {due.label.toLowerCase()}: {xu(due.amount)}</Text>
        <Text className="mt-1 leading-6 text-stone">Thanh toán đơn hàng hiện thực hiện trên website Vịnh, trong hội thoại với {partyName(order)}.</Text>
        {!!web && /^https?:\/\//.test(web) && <Button label="Mở website để thanh toán" secondary
          onPress={() => void WebBrowser.openBrowserAsync(`${web}/ca-nhan?tab=chat&chat=${order.counterpart.id}`)} />}
      </View>}

      <View className="mt-5 rounded-2xl bg-white px-4">
        <Line label="Giá đơn" value={xu(order.price)} />
        <Line label={`Cọc (${order.deposit_pct}%)`} value={xu(depositAmount(order))} />
        <Line label="Đã thanh toán" value={xu(order.paid)} />
        <Line label="Còn lại" value={xu(Math.max(0, order.price - order.paid))} />
        <Line label="Phạm vi sử dụng" value={order.usage_scope ? SCOPE_LABELS[order.usage_scope] ?? order.usage_scope : 'Chưa chọn'} />
        <Line label="Lần sửa" value={`${order.revisions_used}/${order.revisions_max}`} />
        <Line label="Bản nháp đã gửi / duyệt" value={`${order.draft_number} / ${order.drafts_approved}`} />
        <Line label="Tạo lúc" value={formatDateTime(order.created_at)} />
        {order.delivered_at && <Line label="Bàn giao lúc" value={formatDateTime(order.delivered_at)} />}
        {order.status === 'delivered' && order.auto_confirm_at && <Line label="Tự xác nhận lúc" value={formatDateTime(order.auto_confirm_at)} />}
        {order.completed_at && <Line label="Hoàn tất lúc" value={formatDateTime(order.completed_at)} />}
      </View>
      {!!order.scope_note && <><Text className="mb-1 mt-5 font-bold text-brand-ink">Ghi chú phạm vi</Text>
        <Text selectable className="leading-6 text-brand-ink">{order.scope_note}</Text></>}
      <Text className="mb-1 mt-5 font-bold text-brand-ink">Brief {order.brief_locked_at ? '(đã chốt)' : '(đang soạn)'}</Text>
      <Text selectable className="leading-6 text-brand-ink">{order.brief || 'Chưa có nội dung.'}</Text>

      {(assets.length > 0 || !!assetError) && <>
        <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Sản phẩm bàn giao</Text>
        <Notice message={assetError} />
        {assets.map((asset, i) => asset.kind === 'illustration_preview'
          ? <View key={i}>
            <Image source={{ uri: asset.url }} accessibilityLabel="Bản xem trước có watermark" resizeMode="contain"
              style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#eceae7' }} />
            <Text className="mt-1 text-sm text-stone">Bản xem trước có watermark. Link hết hạn sau 15 phút — kéo xuống để lấy lại.</Text>
          </View>
          : <Button key={i} label="Nghe bản thu bàn giao" secondary onPress={() => void WebBrowser.openBrowserAsync(asset.url)} />)}
      </>}

      <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Nhật ký đơn hàng</Text>
      {!events.length && <Text className="text-stone">Chưa có sự kiện.</Text>}
      {events.map(event => <View key={event.id} className="border-l-2 border-brand-gold pb-4 pl-4">
        <Text className="font-bold text-brand-ink">{eventLabel(event.event_type)}{typeof event.payload?.amount === 'number' ? ` · ${xu(event.payload.amount)}` : ''}</Text>
        <Text className="text-sm text-stone">{formatDateTime(event.created_at)}{event.actor_id ? event.actor_id === userId ? ' · bạn' : ` · ${partyName(order)}` : ' · hệ thống'}</Text>
      </View>)}
      <Text className="mt-4 text-sm leading-5 text-stone">Các thao tác trên đơn (brief, bản nháp, bàn giao, hủy…) đang được đưa lên app; hiện vẫn thực hiện trên website.</Text>
    </ScrollView>
  </SafeAreaView>;
}
