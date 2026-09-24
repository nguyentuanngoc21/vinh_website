import { Image, Text, View } from 'react-native';

/** Round avatar with the first letter of the nickname as fallback. */
export function Avatar({ person, size = 48 }: { person: { nickname: string | null; avatarUrl: string | null }; size?: number }) {
  return <View className="items-center justify-center overflow-hidden rounded-full bg-cream" style={{ width: size, height: size }}>
    {person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} accessibilityIgnoresInvertColors style={{ width: size, height: size }} />
      : <Text className="font-bold text-brand-ink" style={{ fontSize: size / 2.6 }}>{(person.nickname ?? '?').slice(0, 1).toUpperCase()}</Text>}
  </View>;
}
