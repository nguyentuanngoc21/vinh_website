import { Image, Pressable, Text, View } from 'react-native';

/** Cover card for horizontal rows: cover image (or title block), title and author. */
export function BookCover({ title, coverUrl, subtitle, onPress, width = 132 }: {
  title: string; coverUrl: string | null; subtitle?: string | null; onPress: () => void; width?: number;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Xem truyện ${title}`} onPress={onPress} style={{ width }}>
    <View className="mb-2 overflow-hidden rounded-xl bg-brand-ink" style={{ width, aspectRatio: 2 / 3 }}>
      {coverUrl ? <Image source={{ uri: coverUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <Text numberOfLines={4} className="p-3 text-base font-bold text-cream-card">{title}</Text>}
    </View>
    <Text numberOfLines={2} className="font-bold text-brand-ink">{title}</Text>
    {!!subtitle && <Text numberOfLines={1} className="text-xs text-stone">{subtitle}</Text>}
  </Pressable>;
}
