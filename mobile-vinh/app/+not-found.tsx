import { Link } from 'expo-router';
import { Text, View } from 'react-native';
export default function NotFound() {
  return <View className="flex-1 items-center justify-center bg-cream-card p-8">
    <Text className="mb-6 text-xl text-brand-ink">Kh?ng t?m th?y trang n?y.</Text>
    <Link href="/" className="p-4 font-bold text-brand-ink">V? Trang ch? ?</Link>
  </View>;
}
