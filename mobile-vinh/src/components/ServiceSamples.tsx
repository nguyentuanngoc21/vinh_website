import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { mobileApi } from '../services/api';
type Sample = { id: string; source: string; unverified_external: boolean; url: string | null };
export function ServiceSamples({ listingId, serviceType, userId, close }: {
  listingId: string; serviceType: string; userId: string; close: () => void;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selected, setSelected] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  const endpoint = `services/${encodeURIComponent(listingId)}/samples`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    mobileApi<{ samples: Sample[] }>(endpoint, userId)
      .then(data => { if (active) setSamples(data.samples); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được mẫu.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, userId, attempt]);
  function refresh() { setLoading(true); setError(''); setRemoving(null); setAttempt(n => n + 1); }
  async function pick() {
    if (lock.current) return;
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: serviceType === 'voice' ? ['audio/mpeg', 'audio/wav'] : ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true, base64: false });
      if (result.canceled || !alive.current) return;
      const file = result.assets[0];
      if (file.size != null && (file.size === 0 || file.size > 15 * 1024 * 1024)) throw new Error('Tệp phải lớn hơn 0 và tối đa 15 MB.');
      setSelected(file);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không chọn được tệp.'); }
  }
  async function mutate(sampleId?: string) {
    if (lock.current || (!sampleId && !selected)) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (sampleId) await mobileApi(`${endpoint}/${encodeURIComponent(sampleId)}`, userId, { action: 'remove' });
      else if (selected) {
        const body = new FormData();
        if (Platform.OS === 'web') {
          if (!selected.file) throw new Error('Hãy chọn lại tệp.');
          body.append('file', selected.file);
        } else {
          // React Native FormData accepts a local URI file descriptor.
          body.append('file', { uri: selected.uri, name: selected.name, type: selected.mimeType || 'application/octet-stream' } as unknown as Blob);
        }
        await mobileApi(endpoint, userId, body);
      }
      if (alive.current) { setSelected(null); setNotice(sampleId ? 'Đã gỡ mẫu khỏi gói.' : 'Đã tải mẫu lên.'); refresh(); }
    } catch (e) {
      if (alive.current) setError(`${e instanceof Error ? e.message : 'Chưa hoàn tất thao tác.'} Hãy làm mới danh sách trước khi thử lại.`);
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function open(url: string) {
    try { await WebBrowser.openBrowserAsync(url); }
    catch { if (alive.current) setError('Không mở được mẫu. Hãy làm mới để lấy liên kết mới.'); }
  }
  return <ScrollView contentContainerStyle={{ padding: 24 }}>
    <Text className="mb-4 text-2xl font-bold text-brand-ink">Mẫu sản phẩm</Text>
    <Text className="mb-4 leading-6 text-stone">Mẫu được tải và gỡ ngay tại đây, độc lập với phần chỉnh sửa thông tin gói.</Text>
    <Text className="mb-3 text-stone">{serviceType === 'voice' ? 'MP3 hoặc WAV' : 'JPG, PNG hoặc WebP'} · Tối đa 15 MB mỗi tệp.</Text>
    <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void pick()} className="mb-3 rounded-xl border border-cream-border p-4"><Text className="text-brand-ink">Chọn tệp mẫu</Text></Pressable>
    {selected && <View className="mb-4">
      <Text className="mb-3 text-brand-ink">Đã chọn: {selected.name}</Text>
      <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void mutate()} className="rounded-xl bg-brand-ink p-4"><Text className="text-white">{busy ? 'Đang xử lý…' : 'Tải mẫu lên'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSelected(null)} className="py-3"><Text className="text-stone">Bỏ chọn tệp</Text></Pressable>
    </View>}
    {!!error && <Text accessibilityLiveRegion="polite" className="mb-3 text-red-700">{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" className="mb-3 text-brand-ink">{notice}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || loading} onPress={refresh} className="py-3"><Text className="text-brand-ink">Làm mới danh sách</Text></Pressable>
    {loading ? <ActivityIndicator /> : samples.map((sample, index) => <View key={sample.id} className="mb-4 rounded-xl border border-cream-border p-4">
      <Text className="mb-2 font-bold text-brand-ink">Mẫu {index + 1}</Text>
      {sample.unverified_external && <Text className="mb-2 text-stone">Mẫu ngoài nền tảng, chưa xác minh.</Text>}
      {sample.url && serviceType === 'illustration' && <Image source={{ uri: sample.url }} style={{ width: '100%', height: 180 }} resizeMode="contain" accessibilityLabel={`Ảnh mẫu ${index + 1}`} />}
      {sample.url ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void open(sample.url!)} className="py-3"><Text className="text-brand-ink">Mở mẫu →</Text></Pressable>
        : <Text className="my-3 text-stone">Chưa có liên kết xem mẫu. Thử làm mới danh sách.</Text>}
      {sample.source === 'upload' && (removing === sample.id ? <View>
        <Text className="text-brand-ink">Gỡ mẫu này khỏi gói dịch vụ?</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void mutate(sample.id)} className="py-3"><Text className="text-red-700">{busy ? 'Đang xử lý…' : 'Xác nhận gỡ mẫu'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setRemoving(null)} className="py-3"><Text className="text-stone">Giữ lại</Text></Pressable>
      </View> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => setRemoving(sample.id)} className="py-3"><Text className="text-red-700">Gỡ mẫu</Text></Pressable>)}
    </View>)}
    {!loading && !error && !samples.length && <Text className="mb-4 text-stone">Chưa có mẫu tải lên.</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={close} className="py-4"><Text className="font-bold text-brand-ink">Đóng</Text></Pressable>
  </ScrollView>;
}
