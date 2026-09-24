import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../src/providers/AuthProvider';
import { useAudio } from '../../src/providers/AudioProvider';
import { Button, Notice, ScreenHeader } from '../../src/components/Form';
import { commissionLabel, getListing, orderService, SERVICE_LABELS, type PublicListing } from '../../src/services/connect';
import { SCOPE_LABELS } from '../../src/services/orders';

export default function ListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Dịch vụ" onBack={() => router.back()} />
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <Listing key={`${session.user.id}:${listingId}`} userId={session.user.id} listingId={listingId} />;
}

const xu = (n: number) => `${n.toLocaleString('vi-VN')} xu`;
const REFUND_STAGES: [keyof NonNullable<PublicListing['refundPolicy']>, string][] = [
  ['before_draft', 'Trước khi có bản nháp'], ['draft_pending', 'Đang chờ duyệt bản nháp'],
  ['draft_approved', 'Sau khi duyệt bản nháp'], ['delivered', 'Sau khi bàn giao'],
];
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View className="mt-5"><Text className="mb-1 font-bold text-brand-ink">{title}</Text>{children}</View>;
}

function Listing({ userId, listingId }: { userId: string; listingId: string }) {
  const audio = useAudio();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    getListing(userId, listingId).then(next => {
      if (!active) return;
      setListing(next); setTier(t => t ?? next.priceTiers[0]?.index ?? null);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được dịch vụ.'); });
    return () => { active = false; };
  }, [userId, listingId]));

  if (!listing) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Dịch vụ" onBack={() => router.back()} />
    {error ? <Notice message={error} /> : <ActivityIndicator color="#143b4d" />}
  </SafeAreaView>;

  const chosen = listing.priceTiers.find(t => t.index === tier);
  const canOrder = !listing.isOwn && listing.isAcceptingOrders && !!chosen;
  function order() {
    if (!chosen) return;
    Alert.alert('Đặt dịch vụ này?', `${listing!.name} · ${chosen.label || 'Gói'} · ${xu(chosen.price)}. Đơn được tạo ở trạng thái Đang soạn: bạn chọn phạm vi sử dụng và viết brief trước, chưa trừ xu.`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đặt dịch vụ', onPress: () => void (async () => {
        setBusy(true); setError('');
        try { const created = await orderService(userId, listing!.id, chosen.index); router.replace({ pathname: '/don-hang/[orderId]', params: { orderId: created.id } }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Không tạo được đơn hàng.'); }
        finally { setBusy(false); }
      })() },
    ]);
  }
  const samples = listing.samples;
  const tracks = samples.filter(s => s.kind === 'audio' && s.url).map((s, i) => ({ id: s.id, title: s.title ?? `Mẫu ${i + 1}`,
    narratorName: listing.seller.nickname ?? '', genre: null, durationSeconds: null, playCount: 0, audioUrl: s.url as string }));

  return <SafeAreaView className="flex-1 bg-cream-card">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <ScreenHeader title="Dịch vụ" onBack={() => router.back()} />
      <Text className="text-xs tracking-widest text-stone">{SERVICE_LABELS[listing.serviceType].toUpperCase()}</Text>
      <Text className="mt-1 text-2xl font-bold text-brand-ink">{listing.name}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/nguoi-dung/[userId]', params: { userId: listing.seller.id } })} className="min-h-12 justify-center">
        <Text className="text-brand-ink">Người thực hiện: {listing.seller.nickname ?? `@${listing.seller.username}`} →</Text>
      </Pressable>
      {!!commissionLabel(listing) && <Text className="text-sm text-stone">{commissionLabel(listing)}</Text>}

      <Section title="Mức giá">
        {listing.priceTiers.map(t => <Pressable key={t.index} accessibilityRole="radio" accessibilityState={{ selected: tier === t.index }} onPress={() => setTier(t.index)}
          className={`mb-2 min-h-12 flex-row items-center justify-between rounded-xl border px-4 ${tier === t.index ? 'border-brand-ink bg-cream' : 'border-cream-border bg-white'}`}>
          <Text className="flex-1 text-brand-ink">{tier === t.index ? '● ' : '○ '}{t.label || 'Gói'}</Text>
          <Text className="font-bold text-brand-ink">{xu(t.price)}</Text>
        </Pressable>)}
        <Text className="text-sm leading-5 text-stone">Cọc {listing.depositPct ?? 50}% khi bắt đầu{listing.deliveryDays ? ` · giao trong ${listing.deliveryDays} ngày` : ''} · sửa tối đa {listing.revisionsMax ?? 2} lần</Text>
      </Section>
      {!!listing.scopeDescription && <Section title="Phạm vi công việc"><Text selectable className="leading-6 text-brand-ink">{listing.scopeDescription}</Text></Section>}
      {!!listing.acceptedContent && <Section title="Nhận"><Text selectable className="leading-6 text-brand-ink">{listing.acceptedContent}</Text></Section>}
      {!!listing.rejectedContent && <Section title="Không nhận"><Text selectable className="leading-6 text-brand-ink">{listing.rejectedContent}</Text></Section>}
      {listing.defaultUsageScope && <Section title="Quyền sử dụng mặc định"><Text className="text-brand-ink">{SCOPE_LABELS[listing.defaultUsageScope] ?? listing.defaultUsageScope}</Text></Section>}
      {listing.refundPolicy && <Section title="Hoàn tiền khi khách hủy">
        {REFUND_STAGES.map(([key, label]) => <Text key={key} className="text-brand-ink">{label}: hoàn {listing.refundPolicy?.[key] ?? 0}%</Text>)}
      </Section>}
      <Section title="Mất liên lạc"><Text className="text-brand-ink">Sau {listing.lostContactDays} ngày không phản hồi có thể báo cáo mất liên lạc.</Text></Section>

      <Section title="Mẫu sản phẩm">
        {!samples.length && <Text className="text-stone">Chưa có mẫu.</Text>}
        {samples.some(s => s.source === 'auto') && <Text className="mb-2 text-sm text-stone">Tự động lấy từ tác phẩm công khai mới nhất của người thực hiện trên Vịnh.</Text>}
        <View className="flex-row flex-wrap gap-2">
          {samples.filter(s => s.kind === 'image' && s.url).map(s => <Image key={s.id} source={{ uri: s.url as string }} accessibilityLabel={s.title ?? 'Mẫu minh họa'}
            style={{ width: '31%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#eceae7' }} />)}
        </View>
        {tracks.map(t => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Nghe ${t.title}`} onPress={() => { void audio.play(t, tracks); router.push('/audio/player'); }}
          className="mb-2 min-h-12 justify-center rounded-xl border border-cream-border bg-white px-4"><Text className="text-brand-ink">▶ {t.title}</Text></Pressable>)}
        {samples.filter(s => s.kind === 'book').map(s => <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId: s.id } })}
          className="mb-2 min-h-12 justify-center rounded-xl border border-cream-border bg-white px-4"><Text className="text-brand-ink">📖 {s.title}</Text></Pressable>)}
        {samples.filter(s => s.kind === 'link' && s.url).map(s => <Pressable key={s.id} accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(s.url as string)}
          className="mb-2 min-h-12 justify-center rounded-xl border border-cream-border bg-white px-4"><Text className="text-brand-ink">Portfolio ngoài Vịnh{s.unverified ? ' · chưa được Nền tảng xác thực' : ''} →</Text></Pressable>)}
      </Section>

      <Notice message={error} />
      {listing.isOwn ? <Text className="mt-6 text-stone">Đây là dịch vụ của bạn.</Text>
        : !listing.isAcceptingOrders ? <Text className="mt-6 text-stone">Dịch vụ đang tạm ngừng nhận đơn.</Text>
          : <Button label={busy ? 'Đang tạo đơn…' : chosen ? `Đặt dịch vụ · ${xu(chosen.price)}` : 'Chọn mức giá'} disabled={busy || !canOrder} onPress={order} />}
    </ScrollView>
  </SafeAreaView>;
}
