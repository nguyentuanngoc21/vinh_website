import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAudio } from '../providers/AudioProvider';

export function MiniPlayer() {
  const audio = useAudio();
  if (!audio.track) return null;
  return <View className="flex-row items-center border-t border-cream-border bg-brand-ink px-4 py-3">
    <Pressable accessibilityRole="button" accessibilityLabel="Mở trình phát audio" onPress={() => router.push('/audio/player')} className="flex-1 py-2">
      <Text numberOfLines={1} className="font-bold text-white">{audio.track.title}</Text>
      <Text numberOfLines={1} className="mt-1 text-xs text-cream">{audio.error ? 'Không phát được · Bấm để thử lại' : audio.track.narratorName}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={audio.loading} onPress={() => void audio.toggle()} className="p-3"><Text className="font-bold text-white">{audio.loading ? '…' : audio.status.playing ? 'Dừng' : 'Phát'}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Đóng trình phát" onPress={audio.stop} className="p-3"><Text className="text-xl text-white">×</Text></Pressable>
  </View>;
}
