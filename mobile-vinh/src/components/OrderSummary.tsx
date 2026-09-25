import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listOrders, partyName, paymentDue, SERVICE_LABELS, STATUS_LABELS, type Order } from '../services/orders';

export function StatusPill({ status }: { status: Order['status'] }) {
  const tone = status === 'cancelled' || status === 'disputed' ? 'border-red-700 text-red-700'
    : status === 'completed' ? 'border-brand-ink bg-brand-ink text-white' : 'border-brand-gold text-brand-ink';
  return <Text className={`self-start overflow-hidden rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{STATUS_LABELS[status] ?? status}</Text>;
}

/** One order in a list: code, service, counterpart, status and money. Tapping opens the detail. */
export function OrderRow({ order }: { order: Order }) {
  const due = paymentDue(order);
  const service = order.service_listings;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Đơn ${order.code}, ${STATUS_LABELS[order.status]}`}
    onPress={() => router.push({ pathname: '/don-hang/[orderId]', params: { orderId: order.id } })}
    className="mb-3 rounded-2xl border border-cream-border bg-white p-4">
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text className="text-xs tracking-widest text-stone">{order.code} · {order.role === 'buyer' ? 'BẠN ĐẶT' : 'BẠN NHẬN'}</Text>
        <Text className="mt-1 text-base font-bold text-brand-ink">{service?.name || SERVICE_LABELS[service?.service_type ?? ''] || 'Dịch vụ'}</Text>
        <Text className="mt-1 text-stone">{order.role === 'buyer' ? 'Người thực hiện' : 'Khách hàng'}: {partyName(order)}</Text>
      </View>
      <StatusPill status={order.status} />
    </View>
    <Text className="mt-3 text-brand-ink">{order.price.toLocaleString('vi-VN')} xu · đã trả {order.paid.toLocaleString('vi-VN')} xu</Text>
    {due && <Text className="mt-1 font-bold text-brand-ink">Cần thanh toán: {due.label.toLowerCase()} {due.amount.toLocaleString('vi-VN')} xu</Text>}
  </Pressable>;
}

/** Order chips for one chat thread (the buyer/seller pair is the conversation, as on the web). */
export function ThreadOrders({ userId, otherUserId }: { userId: string; otherUserId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    // Best-effort: the thread must still work if orders cannot be loaded.
    listOrders(userId, otherUserId).then(next => { if (active) setOrders(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId, otherUserId]));
  if (!orders.length) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
    {orders.map(order => <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Mở đơn ${order.code}`}
      onPress={() => router.push({ pathname: '/don-hang/[orderId]', params: { orderId: order.id } })}
      className="min-h-12 justify-center rounded-xl border border-cream-border bg-white px-4 py-2">
      <Text className="font-bold text-brand-ink">{order.code}</Text>
      <Text className="text-xs text-stone">{STATUS_LABELS[order.status]}</Text>
    </Pressable>)}
  </ScrollView>;
}
