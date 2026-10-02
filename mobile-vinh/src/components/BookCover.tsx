import { Image, Pressable, Text, View } from 'react-native';
import { AgeBadge } from './AgeGate';
import { useCanReadAdult } from '../hooks/useCanReadAdult';

/** Cover card for horizontal rows: cover image (or title block), title and author.
 * ageRating: huy hiệu 16+/18+; bìa 18+ bị làm mờ với người chưa xác thực tuổi (như web). */
export function BookCover({ title, coverUrl, subtitle, onPress, width = 132, ageRating = 'all' }: {
  title: string; coverUrl: string | null; subtitle?: string | null; onPress: () => void; width?: number;
  ageRating?: 'all' | '16' | '18';
}) {
  const canReadAdult = useCanReadAdult(ageRating === '18');
  const blur = ageRating === '18' && !canReadAdult;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Xem truyện ${title}`} onPress={onPress} style={{ width }}>
    <View className="mb-2 overflow-hidden rounded-xl bg-brand-ink" style={{ width, aspectRatio: 2 / 3 }}>
      {coverUrl ? <Image source={{ uri: coverUrl }} accessibilityIgnoresInvertColors blurRadius={blur ? 25 : 0}
        style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <Text numberOfLines={4} className="p-3 text-base font-bold text-cream-card">{title}</Text>}
      {ageRating !== 'all' && <View style={{ position: 'absolute', right: 6, bottom: 6 }}><AgeBadge rating={ageRating} /></View>}
    </View>
    <Text numberOfLines={2} className="font-bold text-brand-ink">{title}</Text>
    {!!subtitle && <Text numberOfLines={1} className="text-xs text-stone">{subtitle}</Text>}
  </Pressable>;
}

/** Bìa thu nhỏ trong danh sách dọc (BXH, tìm kiếm) — cùng quy tắc huy hiệu/làm mờ như BookCover. */
export function ThumbCover({ coverUrl, ageRating = 'all' }: { coverUrl: string | null; ageRating?: 'all' | '16' | '18' }) {
  const canReadAdult = useCanReadAdult(ageRating === '18');
  return <View className="overflow-hidden rounded-md bg-brand-ink" style={{ width: 46, height: 66 }}>
    {coverUrl && <Image source={{ uri: coverUrl }} accessibilityIgnoresInvertColors blurRadius={ageRating === '18' && !canReadAdult ? 18 : 0}
      style={{ width: '100%', height: '100%' }} />}
    {ageRating !== 'all' && <View style={{ position: 'absolute', left: 0, right: 0, bottom: 2, alignItems: 'center' }}>
      <AgeBadge rating={ageRating} /></View>}
  </View>;
}
