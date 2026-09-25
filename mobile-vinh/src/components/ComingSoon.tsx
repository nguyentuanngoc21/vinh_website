import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function ComingSoon({ title, description }: { title: string; description: string }) {
  return <SafeAreaView className="flex-1 bg-cream-card"><View className="flex-1 justify-center px-8">
    <Text className="mb-4 text-sm uppercase tracking-widest text-stone">VỊNH · SẮP RA MẮT</Text>
    <Text className="mb-4 text-3xl font-bold text-brand-ink">{title}</Text>
    <Text className="text-base leading-7 text-stone">{description}</Text>
  </View></SafeAreaView>;
}
