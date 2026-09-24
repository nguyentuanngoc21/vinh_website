import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { pickImage, type PreparedImage } from '../services/images';

/** One image field (e.g. a CCCD side): take a photo or choose one, preview, remove. */
export function ImageSlot({ label, image, onChange, disabled }: {
  label: string; image: PreparedImage | null; onChange: (image: PreparedImage | null) => void; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function choose(source: 'library' | 'camera') {
    setBusy(true); setError('');
    try { const picked = await pickImage(source); if (picked) onChange(picked); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không chọn được ảnh.'); }
    finally { setBusy(false); }
  }
  const locked = disabled || busy;
  const action = (text: string, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={`${text} — ${label}`}
    disabled={locked} onPress={onPress} style={{ opacity: locked ? 0.5 : 1 }}
    className="min-h-12 flex-1 items-center justify-center rounded-xl border border-brand-ink bg-cream-card px-3">
    <Text className="text-center text-brand-ink">{text}</Text>
  </Pressable>;
  return <View className="mb-4 rounded-2xl border border-cream-border bg-white p-4">
    <Text className="mb-3 font-bold text-brand-ink">{label}</Text>
    {image ? <Image source={{ uri: image.uri }} accessibilityLabel={`Ảnh ${label}`} resizeMode="contain"
      style={{ width: '100%', aspectRatio: image.width / image.height || 1.6, borderRadius: 12, backgroundColor: '#eceae7' }} />
      : <Text className="mb-1 text-sm text-stone">Chưa có ảnh. Chụp rõ nét, đủ bốn góc, không bị lóa.</Text>}
    {busy && <ActivityIndicator color="#143b4d" style={{ marginTop: 12 }} />}
    <View className="mt-3 flex-row gap-3">
      {action('Chụp ảnh', () => void choose('camera'))}
      {action(image ? 'Chọn ảnh khác' : 'Chọn ảnh', () => void choose('library'))}
    </View>
    {image && <Pressable accessibilityRole="button" disabled={locked} onPress={() => onChange(null)} className="mt-2 min-h-12 items-center justify-center">
      <Text className="text-red-700">Gỡ ảnh</Text></Pressable>}
    {!!error && <Text accessibilityLiveRegion="polite" className="mt-2 text-sm text-red-700">{error}</Text>}
  </View>;
}
