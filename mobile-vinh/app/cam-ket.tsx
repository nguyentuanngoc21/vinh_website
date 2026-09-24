import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { mobileApi } from '../src/services/api';
import { AgreementDocument } from '../src/components/AgreementDocument';
type Agreement = { id: string; name: string; desc: string; updatedAt: string; accepted: boolean; updatedSincePending: boolean; acceptedAt: string | null };
type Document = { id: string; name: string; version: string; html: string; missingFields: string[] };
export default function Agreements() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Panel key={session?.user.id ?? 'guest'} userId={session?.user.id} />;
}
function Panel({ userId }: { userId?: string }) {
  const [items, setItems] = useState<Agreement[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [success, setSuccess] = useState('');
  const sequence = useRef(0);
  const lock = useRef(false);
  const load = useCallback(() => {
    const request = ++sequence.current;
    setDoc(null); setReady(false); setConsent(false);
    if (userId) {
      setLoading(true); setError('');
      mobileApi<{ agreements: Agreement[] }>('agreements', userId).then(result => { if (request === sequence.current) setItems(result.agreements); })
        .catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được danh sách.'); })
        .finally(() => { if (request === sequence.current) setLoading(false); });
    }
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);
  async function open(id: string) {
    if (!userId || lock.current) return;
    lock.current = true; setLoading(true); setError(''); setSuccess(''); setReady(false); setConsent(false); setDoc(null);
    const request = ++sequence.current;
    try { const result = await mobileApi<Document>(`agreements/${encodeURIComponent(id)}`, userId); if (request === sequence.current) setDoc(result); }
    catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được văn bản.'); }
    finally { lock.current = false; if (request === sequence.current) setLoading(false); }
  }
  async function accept() {
    if (!userId || !doc || !ready || !consent || doc.missingFields.length || lock.current) return;
    lock.current = true; setLoading(true); setError('');
    const request = sequence.current;
    try {
      await mobileApi(`agreements/${encodeURIComponent(doc.id)}/accept`, userId, { version: doc.version });
      if (request === sequence.current) { setSuccess('Đã xác nhận thỏa thuận.'); load(); }
    } catch (e) { if (request === sequence.current) { setConsent(false); setError(e instanceof Error ? e.message : 'Chưa xác nhận được.'); } }
    finally { lock.current = false; if (request === sequence.current) setLoading(false); }
  }
  const accepted = doc && items.some(item => item.id === doc.id && item.updatedAt === doc.version && item.accepted);
  return <SafeAreaView className="flex-1 bg-cream-card">
    <View className="p-5">
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => doc ? load() : router.canGoBack() ? router.back() : router.replace('/')} className="py-3"><Text className="text-brand-ink">← Quay lại</Text></Pressable>
      <Text className="text-2xl font-bold text-brand-ink">{doc?.name || 'Cam kết & Thỏa thuận'}</Text>
      {!!error && <Text accessibilityLiveRegion="polite" className="mt-3 text-red-700">{error}</Text>}
      {!!success && <Text accessibilityLiveRegion="polite" className="mt-3 text-brand-ink">{success}</Text>}
      {!!userId && !loading && <Pressable accessibilityRole="button" onPress={() => doc ? void open(doc.id) : load()} className="py-3"><Text className="text-brand-ink">Tải lại ↻</Text></Pressable>}
    </View>
    {!userId ? <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để xem và xác nhận →</Text></Pressable>
      : doc ? <>
        <Text className="px-5 pb-3 text-stone">Phiên bản: {doc.version}</Text>
        <AgreementDocument key={`${doc.id}:${doc.version}`} html={doc.html} onReady={() => setReady(true)} onError={() => { setReady(false); setError('Không hiển thị được văn bản. Hãy tải lại.'); }} />
        <View className="p-4">
          {!!doc.missingFields.length && <>
            <Text className="mb-2 text-red-700">Cần bổ sung trước khi xác nhận: {doc.missingFields.join(', ')}.</Text>
            {/* Returning here reloads the list, so the refreshed party details show when the document is reopened. */}
            <Pressable accessibilityRole="button" onPress={() => router.push('/thong-tin-ca-nhan')} className="mb-3 min-h-12 justify-center">
              <Text className="font-bold text-brand-ink">Cập nhật Thông tin cá nhân →</Text>
            </Pressable>
          </>}
          {accepted ? <Text className="text-brand-ink">Bạn đã xác nhận phiên bản này.</Text> : <>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} disabled={!ready || loading || !!doc.missingFields.length} onPress={() => setConsent(v => !v)} className="py-3">
              <Text className="text-brand-ink">{consent ? '☑' : '☐'} Tôi đã đọc và đồng ý với văn bản này.</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!consent || !ready || loading || !!doc.missingFields.length} onPress={() => void accept()}
              style={{ opacity: !consent || !ready || loading || doc.missingFields.length ? 0.5 : 1 }} className="items-center rounded-xl bg-brand-ink p-4">
              <Text className="text-white">{loading ? 'Đang xử lý…' : 'Xác nhận thỏa thuận'}</Text>
            </Pressable>
          </>}
        </View>
      </> : loading ? <ActivityIndicator color="#143b4d" /> : <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => void open(item.id)} className="mb-3 rounded-2xl border border-cream-border p-5">
          <Text className="mb-2 text-lg font-bold text-brand-ink">{item.name}</Text><Text className="mb-3 leading-6 text-stone">{item.desc}</Text>
          <Text className="text-brand-ink">{item.accepted ? 'Đã xác nhận' : item.updatedSincePending ? 'Có bản cập nhật — cần xác nhận lại' : 'Chưa xác nhận'} →</Text>
        </Pressable>} />}
  </SafeAreaView>;
}
