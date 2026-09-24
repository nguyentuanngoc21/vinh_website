import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AudioTrack, formatAudioTime, getAudioCatalog } from '../../src/services/audio';
import { useAuth } from '../../src/providers/AuthProvider';
import { useAudio } from '../../src/providers/AudioProvider';

export default function Audio() {
  const { session } = useAuth();
  const audio = useAudio();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const filtered = tracks.filter(t => `${t.title} ${t.narratorName} ${t.genre || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-cream-card">
    <FlatList data={filtered} keyExtractor={track => track.id} refreshing={loading} onRefresh={load} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      ListHeaderComponent={<>
        <Text className="mb-3 text-sm tracking-widest text-stone">VỊNH · AUDIO DRAMA</Text>
        <Text className="mb-4 text-3xl font-bold leading-10 text-brand-ink">{'Nhắm mắt lại.\nMở một thế giới.'}</Text>
        <Text className="mb-6 text-base leading-7 text-stone">Những câu chuyện qua giọng kể của cộng đồng Vịnh.</Text>
        <TextInput accessibilityLabel="Tìm audio, người kể hoặc thể loại" value={search} onChangeText={setSearch} placeholder="Tìm audio, người kể, thể loại…" placeholderTextColor="#8a8178" className="mb-6 rounded-xl border border-cream-border bg-white p-4 text-brand-ink" />
        {!session && <Pressable onPress={() => router.push('/(tabs)/ca-nhan')} className="mb-6 rounded-xl bg-brand-ink p-4"><Text className="text-center font-bold text-white">Đăng nhập để nghe audio</Text></Pressable>}
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
