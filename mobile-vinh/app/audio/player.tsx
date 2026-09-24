import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAudio } from '../../src/providers/AudioProvider';
import { formatAudioTime } from '../../src/services/audio';

export default function AudioPlayer() {
  const audio = useAudio();
  return <SafeAreaView className="flex-1 bg-cream-card"><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/audio')} className="mb-6 self-start py-3"><Text className="font-bold text-brand-ink">← Quay lại</Text></Pressable>
    {!audio.track ? <Text className="py-12 text-center text-stone">Chọn một bản thu ở tab Audio để bắt đầu nghe.</Text> : <>
      <View className="mb-7 min-h-64 items-center justify-center rounded-3xl bg-brand-ink p-8">
        <Text className="mb-8 text-xs tracking-widest text-brand-gold">VỊNH · AUDIO DRAMA</Text>
        <Text className="text-center text-3xl font-bold leading-10 text-white">{audio.track.title}</Text>
        <Text className="mt-6 text-center text-cream">{audio.track.narratorName}</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.max(1, audio.status.duration), now: Math.min(audio.status.currentTime, Math.max(1, audio.status.duration)) }}
        className="mb-3 h-2 overflow-hidden rounded-full bg-cream-border"><View className="h-2 bg-brand-ink" style={{ width: `${audio.status.duration > 0 ? Math.min(100, audio.status.currentTime / audio.status.duration * 100) : 0}%` }} /></View>
      <View className="mb-6 flex-row justify-between"><Text className="text-stone">{formatAudioTime(audio.status.currentTime)}</Text><Text className="text-stone">{formatAudioTime(audio.status.duration || audio.track.durationSeconds)}</Text></View>
      {(audio.loading || audio.status.isBuffering) && <ActivityIndicator color="#143b4d" />}
      {!!audio.error && <Text accessibilityLiveRegion="polite" className="mb-4 text-red-700">{audio.error}</Text>}
      <View className="flex-row justify-center gap-3">
        <Control label="−15 giây" disabled={audio.loading || !audio.status.isLoaded} onPress={() => void audio.seek(audio.status.currentTime - 15)} />
        <Control label={audio.error ? 'Thử lại' : audio.status.playing ? 'Tạm dừng' : 'Phát'} disabled={audio.loading} onPress={() => void audio.toggle()} />
        <Control label="+15 giây" disabled={audio.loading || !audio.status.isLoaded} onPress={() => void audio.seek(audio.status.currentTime + 15)} />
      </View>
      <Text className="mb-3 mt-8 font-bold text-brand-ink">Tốc độ</Text>
      <View className="flex-row flex-wrap gap-2">{[1, 1.25, 1.5, 2].map(rate => <Control key={rate} label={`${rate}×`} selected={audio.status.playbackRate === rate} disabled={!audio.status.isLoaded} onPress={() => audio.rate(rate)} />)}</View>
      <Text className="mb-3 mt-8 font-bold text-brand-ink">Hẹn giờ tắt</Text>
      <View className="flex-row flex-wrap gap-2">{[0, 15, 30, 60].map(minutes => <Control key={minutes} label={minutes ? `${minutes} phút` : 'Tắt hẹn giờ'} onPress={() => audio.sleep(minutes)} />)}</View>
      {audio.sleepAt && <Text className="mt-3 text-sm text-stone">Dừng lúc {new Date(audio.sleepAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.</Text>}
      <Text className="mt-3 text-xs leading-5 text-stone">Hẹn giờ có thể trễ nếu điện thoại tạm dừng ứng dụng khi chạy nền.</Text>
      <Text className="mb-3 mt-8 font-bold text-brand-ink">Danh sách nghe</Text>
      {audio.queue.map((track, index) => <Pressable key={track.id} accessibilityRole="button" onPress={() => void audio.play(track, audio.queue)} className="mb-2 flex-row rounded-xl border border-cream-border p-4">
        <Text className="mr-4 text-stone">{String(index + 1).padStart(2, '0')}</Text><Text className="flex-1 text-brand-ink">{track.title}</Text>
        {audio.track?.id === track.id && <Text className="ml-2 text-brand-ink">♫</Text>}
      </Pressable>)}
    </>}
  </ScrollView></SafeAreaView>;
}
function Control({ label, onPress, disabled, selected }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    className={`min-h-12 items-center justify-center rounded-xl border border-brand-ink px-4 py-3 ${selected ? 'bg-brand-ink' : 'bg-cream-card'}`} style={{ opacity: disabled ? 0.4 : 1 }}>
    <Text className={selected ? 'font-bold text-white' : 'font-bold text-brand-ink'}>{label}</Text></Pressable>;
}
