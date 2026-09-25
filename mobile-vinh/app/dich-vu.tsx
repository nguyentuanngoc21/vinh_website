import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { mobileApi } from '../src/services/api';
import { ServiceEditor, type EditableService } from '../src/components/ServiceEditor';
import { ServiceSamples } from '../src/components/ServiceSamples';
type Listing = EditableService & { id: string; name: string; service_type: string; scope_description: string;
  activeCommissionCount: number | null; commissionStatus: 'available' | 'busy' | 'off' | null;
  delivery_days: number | null; deposit_pct: number | null; is_accepting_orders: boolean; is_accepting_commissions: boolean; missingFields: { label: string }[] };
const labels: Record<string, string> = { illustration: 'Minh họa', voice: 'Thu âm', ghostwriting: 'Viết thuê' };
export default function Services() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Listings key={session?.user.id ?? 'guest'} userId={session?.user.id} />;
}
function Listings({ userId }: { userId?: string }) {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Listing | null>(null);
  const [sampleListing, setSampleListing] = useState<Listing | null>(null);
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const lock = useRef(false);
  const load = useCallback(() => {
    const request = ++sequence.current;
    if (userId) {
      setLoading(true); setError('');
      mobileApi<{ listings: Listing[] }>('services', userId).then(data => { if (request === sequence.current) setItems(data.listings); })
        .catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được dịch vụ.'); })
        .finally(() => { if (request === sequence.current) setLoading(false); });
    }
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);
  async function create(serviceType: string) {
    if (!userId || lock.current || loading) return;
    lock.current = true; setBusy('new'); setError(''); setNotice('');
    const request = sequence.current;
    try {
      await mobileApi('services', userId, { serviceType });
      if (request === sequence.current) { setNotice('Đã tạo gói mới ở trạng thái tạm ngừng. Chọn Chỉnh sửa để điền thông tin.'); load(); }
    } catch (e) { if (request === sequence.current) setError((e instanceof Error ? e.message : 'Chưa tạo được gói.') + ' Hãy làm mới danh sách trước khi thử lại.'); }
    finally { lock.current = false; setBusy(null); }
  }
  async function toggle(item: Listing, commission = false) {
    if (!userId || lock.current || loading) return;
    lock.current = true; setBusy(item.id); setError('');
    const request = sequence.current;
    try {
      await mobileApi(`services/${encodeURIComponent(item.id)}`, userId, commission
        ? { isAcceptingCommissions: !item.is_accepting_commissions }
        : { isAcceptingOrders: !item.is_accepting_orders });
      if (request === sequence.current) load();
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Chưa cập nhật được trạng thái.'); }
    finally { lock.current = false; setBusy(null); }
  }
  return <SafeAreaView className="flex-1 bg-cream-card">
    <View className="p-5">
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} className="py-3"><Text className="text-brand-ink">← Quay lại</Text></Pressable>
      <Text className="mb-3 text-2xl font-bold text-brand-ink">Dịch vụ của tôi</Text>
      <Text className="leading-6 text-stone">Tạo gói, chỉnh thông tin và mức giá; quản lý trạng thái nhận đơn.</Text>
      {!!notice && <Text accessibilityLiveRegion="polite" className="mt-3 text-brand-ink">{notice}</Text>}
      {!!userId && <View className="mt-3 flex-row flex-wrap gap-2">{Object.entries(labels).map(([type, label]) => <Pressable key={type} accessibilityRole="button" disabled={!!busy || loading} onPress={() => void create(type)} className="rounded-xl border border-cream-border p-3"><Text className="text-brand-ink">+ {label}</Text></Pressable>)}</View>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/cam-ket')} className="py-3"><Text className="font-bold text-brand-ink">Cam kết & Thỏa thuận →</Text></Pressable>
      {!!error && <Text accessibilityLiveRegion="polite" className="text-red-700">{error}</Text>}
      {!!userId && <Pressable accessibilityRole="button" disabled={loading || !!busy} onPress={() => { load(); }} className="py-3"><Text className="text-brand-ink">Làm mới ↻</Text></Pressable>}
    </View>
    {!userId ? <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để xem dịch vụ →</Text></Pressable>
      : loading ? <ActivityIndicator color="#143b4d" /> : <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={!error ? <Text className="text-stone">Bạn chưa có gói dịch vụ. Chọn loại dịch vụ phía trên để tạo gói.</Text> : null}
        renderItem={({ item }) => <View className="mb-4 rounded-2xl border border-cream-border p-5">
          <Text className="mb-2 text-sm text-stone">{labels[item.service_type] || 'Dịch vụ'}</Text>
          <Text className="mb-3 text-xl font-bold text-brand-ink">{item.name || 'Gói chưa đặt tên'}</Text>
          <Text className="mb-3 leading-6 text-stone">{item.scope_description || 'Chưa có phạm vi công việc.'}</Text>
          <Text className="mb-3 text-stone">Giao: {item.delivery_days ?? '—'} ngày · Cọc: {item.deposit_pct ?? '—'}%</Text>
          <Text className="mb-3 font-bold text-brand-ink">{item.is_accepting_orders ? 'Đang nhận đơn' : 'Tạm ngừng nhận đơn'}</Text>
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => setEditing(item)} className="py-3"><Text className="font-bold text-brand-ink">Chỉnh sửa gói →</Text></Pressable>
          {item.service_type !== 'ghostwriting' && <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => setSampleListing(item)} className="py-3"><Text className="font-bold text-brand-ink">Mẫu sản phẩm →</Text></Pressable>}
          {!!item.missingFields.length && <Text className="mb-3 leading-6 text-red-700">Cần hoàn thiện: {item.missingFields.map(field => field.label).join(', ')}.</Text>}
          <Pressable accessibilityRole="button" disabled={!!busy || (!item.is_accepting_orders && !!item.missingFields.length)} onPress={() => void toggle(item)}
            style={{ opacity: busy || (!item.is_accepting_orders && item.missingFields.length) ? 0.5 : 1 }} className="items-center rounded-xl bg-brand-ink p-4">
            <Text className="text-white">{busy === item.id ? 'Đang lưu…' : item.is_accepting_orders ? 'Tạm ngừng nhận đơn' : 'Bật nhận đơn'}</Text>
          </Pressable>
          <View className="mt-5 border-t border-cream-border pt-4">
            <Text className="mb-2 font-bold text-brand-ink">{item.is_accepting_commissions ? 'Đang nhận commission' : 'Tạm ngừng nhận commission'}</Text>
            <Text className="mb-3 leading-6 text-stone">Hạn mức: {item.monthly_commission_limit == null ? 'Chưa đặt — chọn Chỉnh sửa gói để đặt hạn mức.' : `${item.monthly_commission_limit} commission/tháng`}</Text>
            <Text className="mb-3 leading-6 text-stone">Trạng thái nhận commission được quản lý riêng với trạng thái nhận đơn.</Text>
            <Text accessibilityLiveRegion="polite" className="mb-3 leading-6 text-brand-ink">
              {item.activeCommissionCount == null ? 'Chưa tải được số commission đang xử lý. Hãy làm mới để thử lại.'
                : `Đang xử lý: ${item.activeCommissionCount}${item.monthly_commission_limit == null ? '' : ` / ${item.monthly_commission_limit}`} commission${item.commissionStatus === 'available' ? ' · Có thể nhận' : item.commissionStatus === 'busy' ? ' · Đang bận' : ''}`}
            </Text>
            <Text className="mb-3 leading-6 text-stone">Chỉ tính đơn đang thực hiện, không phải tổng đơn đã nhận trong tháng.</Text>
            <Pressable accessibilityRole="button" disabled={!!busy || (!item.is_accepting_commissions && item.monthly_commission_limit == null)}
              onPress={() => void toggle(item, true)} style={{ opacity: busy || (!item.is_accepting_commissions && item.monthly_commission_limit == null) ? 0.5 : 1 }}
              className="items-center rounded-xl border border-cream-border p-4">
              <Text className="text-brand-ink">{busy === item.id ? 'Đang lưu…' : item.is_accepting_commissions ? 'Tạm ngừng nhận commission' : 'Bật nhận commission'}</Text>
            </Pressable>
          </View>
        </View>} />}
    <Modal visible={!!sampleListing} animationType="slide" onRequestClose={() => { /* Close explicitly to protect pending uploads. */ }}>
      <SafeAreaView className="flex-1 bg-cream-card">{sampleListing && userId && <ServiceSamples key={sampleListing.id} listingId={sampleListing.id}
        serviceType={sampleListing.service_type} userId={userId} close={() => setSampleListing(null)} />}</SafeAreaView>
    </Modal>
    <Modal visible={!!editing} animationType="slide" onRequestClose={() => { /* Use the editor's explicit Cancel to avoid losing a pending save. */ }}>
      <SafeAreaView className="flex-1 bg-cream-card">{editing && userId && <ServiceEditor key={editing.id} item={editing} userId={userId} close={message => {
        setEditing(null); if (message) { setNotice(message); load(); }
      }} />}</SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
