import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { AudioTrack, formatAudioTime, getAudioCatalog, getListeningProgress, type ListeningProgress } from '../../src/services/audio';
import { useAuth } from '../../src/providers/AuthProvider';
import { useAudio } from '../../src/providers/AudioProvider';

export default function Audio() {
  const { session } = useAuth();
  const audio = useAudio();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // "Nghe tiếp": positions saved on web or mobile (audio_progress), refreshed whenever the tab is shown.
  const [progress, setProgress] = useState<ListeningProgress[]>([]);
  const userId = session?.user.id;
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    getListeningProgress(userId).then(list => { if (active) setProgress(list); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setTracks(await getAudioCatalog()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được audio.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    getAudioCatalog().then(data => { if (active) setTracks(data); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const resume = userId ? progress.map(p => ({ progress: p, track: tracks.find(t => t.id === p.audioId) }))
    .filter((r): r is { progress: ListeningProgress; track: AudioTrack } => !!r.track && r.progress.positionSeconds > 5).slice(0, 5) : [];
  const filtered = tracks.filter(t => `${t.title} ${t.narratorName} ${t.genre || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-cream-card">
    <FlatList data={filtered} keyExtractor={track => track.id} refreshing={loading} onRefresh={load} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      ListHeaderComponent={<>
        <Text className="mb-3 text-sm tracking-widest text-stone">VỊNH · AUDIO DRAMA</Text>
        <Text className="mb-4 text-3xl font-bold leading-10 text-brand-ink">{'Nhắm mắt lại.\nMở một thế giới.'}</Text>
        <Text className="mb-6 text-base leading-7 text-stone">Những câu chuyện qua giọng kể của cộng đồng Vịnh.</Text>
        <TextInput accessibilityLabel="Tìm audio, người kể hoặc thể loại" value={search} onChangeText={setSearch} placeholder="Tìm audio, người kể, thể loại…" placeholderTextColor="#8a8178" className="mb-6 rounded-xl border border-cream-border bg-white p-4 text-brand-ink" />
        {!session && <Pressable onPress={() => router.push('/(tabs)/ca-nhan')} className="mb-6 rounded-xl bg-brand-ink p-4"><Text className="text-center font-bold text-white">Đăng nhập để nghe audio</Text></Pressable>}
        {!!resume.length && !search && <>
          <Text className="mb-3 text-xl font-bold text-brand-ink">Nghe tiếp</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
            {resume.map(({ track, progress: p }) => <Pressable key={track.id} accessibilityRole="button" accessibilityLabel={`Nghe tiếp ${track.title}`}
              onPress={() => { void audio.play(track, resume.map(r => r.track)); router.push('/audio/player'); }}
              style={{ width: 220 }} className="rounded-2xl bg-brand-ink p-4">
              <Text numberOfLines={2} className="text-base font-bold text-cream-card">{track.title}</Text>
              <Text numberOfLines={1} className="mt-1 text-sm text-cream">{track.narratorName}</Text>
              <Text className="mt-3 text-sm font-bold text-brand-gold">▶ {formatAudioTime(p.positionSeconds)} / {formatAudioTime(track.durationSeconds)}</Text>
            </Pressable>)}
          </ScrollView>
        </>}
        {!!error && <View className="mb-5 rounded-xl bg-white p-4"><Text className="mb-3 text-red-700">{error}</Text><Pressable onPress={load}><Text className="font-bold text-brand-ink">Thử lại</Text></Pressable></View>}
      </>}
      ListEmptyComponent={loading ? <ActivityIndicator color="#143b4d" /> : !error ? <View className="rounded-3xl border border-cream-border p-8"><Text className="mb-3 text-xl font-bold text-brand-ink">{search ? 'Chưa tìm thấy audio phù hợp' : 'Những giọng kể đang được chuẩn bị'}</Text><Text className="leading-7 text-stone">{search ? 'Thử tên truyện hoặc người kể khác.' : 'Chưa có bản thu công khai. Bạn có thể quay lại đây khi cộng đồng xuất bản audio mới.'}</Text></View> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => {
        if (!session) { router.push('/(tabs)/ca-nhan'); return; }
        void audio.play(item, filtered); router.push('/audio/player');
      }} className="mb-4 rounded-2xl border border-cream-border p-5">
        <Text className="mb-3 text-xs text-stone">{item.genre || 'Audio'} · {formatAudioTime(item.durationSeconds)}</Text>
        <Text className="mb-2 text-xl font-bold text-brand-ink">{item.title}</Text>
        <Text className="mb-5 text-stone">{item.narratorName}</Text>
        <Text className="font-bold text-brand-ink">{audio.track?.id === item.id && audio.status.playing ? 'Đang phát ♫' : 'Nghe ngay →'}</Text>
      </Pressable>} />
  </SafeAreaView>;
}
