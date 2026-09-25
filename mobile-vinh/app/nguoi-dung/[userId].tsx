import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { useAudio } from '../../src/providers/AudioProvider';
import { Button, Notice, ScreenHeader } from '../../src/components/Form';
import { Avatar } from '../../src/components/Avatar';
import { commissionLabel, getDirectory, SERVICE_LABELS, tagsOf, toggleFollow, updateCachedPerson, type Person } from '../../src/services/connect';
import type { AudioTrack } from '../../src/services/audio';

export default function Profile() {
  const { userId: personId } = useLocalSearchParams<{ userId: string }>();
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Hồ sơ" onBack={() => router.back()} />
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <PersonView key={`${session.user.id}:${personId}`} userId={session.user.id} personId={personId} />;
}

function PersonView({ userId, personId }: { userId: string; personId: string }) {
  const audio = useAudio();
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    getDirectory(userId).then(people => { if (active) setPerson(people.find(p => p.id === personId) ?? null); })
      .catch(e => { if (active) { setPerson(null); setError(e instanceof Error ? e.message : 'Không tải được hồ sơ.'); } });
    return () => { active = false; };
  }, [userId, personId]));

  if (person === undefined) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!person) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Hồ sơ" onBack={() => router.back()} />
    {/* Same scope as the web /ket-noi?p= profile: the directory's newest members. */}
    <Text className="leading-6 text-stone">{error || 'Không tìm thấy hồ sơ này trong danh bạ Kết nối.'}</Text>
  </SafeAreaView>;

  const isSelf = person.id === userId;
  async function follow() {
    if (!person || busy) return;
    setBusy(true); setError('');
    try {
      const { following } = await toggleFollow(userId, person.id);
      const patch = { isFollowingByViewer: following, followerCount: person.followerCount + (following ? 1 : -1) };
      setPerson({ ...person, ...patch });
      updateCachedPerson(userId, person.id, patch);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không cập nhật được theo dõi.'); }
    finally { setBusy(false); }
  }
  const tracks: AudioTrack[] = person.works.audio.filter(a => a.audioUrl).map(a => ({
    id: a.id, title: a.title, narratorName: person.nickname, genre: null, durationSeconds: null, playCount: 0, audioUrl: a.audioUrl as string,
  }));

  return <SafeAreaView className="flex-1 bg-cream-card">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
      <ScreenHeader title="Hồ sơ" onBack={() => router.back()} />
      {person.coverImageUrl && <Image source={{ uri: person.coverImageUrl }} accessibilityLabel="Ảnh bìa" resizeMode="cover"
        style={{ width: '100%', aspectRatio: 3, borderRadius: 16, marginBottom: 16 }} />}
      <View className="flex-row items-center gap-4">
        <Avatar person={person} size={72} />
        <View className="flex-1">
          <Text className="text-2xl font-bold text-brand-ink">{person.nickname}</Text>
          <Text className="text-stone">@{person.username} · Tham gia {person.joined}</Text>
          <Text className="mt-1 text-brand-ink">{tagsOf(person).join(' · ')} · {person.followerCount} người theo dõi</Text>
        </View>
      </View>
      {!!person.bio && <Text selectable className="mt-4 leading-6 text-brand-ink">{person.bio}</Text>}
      {!isSelf && <View className="flex-row gap-3">
        <View className="flex-1"><Button label={person.isFollowingByViewer ? 'Đang theo dõi' : 'Theo dõi'} secondary={person.isFollowingByViewer}
          disabled={busy} onPress={() => void follow()} /></View>
        <View className="flex-1"><Button label="Nhắn tin" secondary onPress={() => router.push({ pathname: '/tin-nhan', params: { chat: person.id } })} /></View>
      </View>}
      <Notice message={error} />

      {!!person.services.length && <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Dịch vụ</Text>}
      {person.services.map(s => <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/goi-dich-vu/[listingId]', params: { listingId: s.id } })}
        className="mb-2 rounded-2xl border border-cream-border bg-white p-4">
        <Text className="text-xs tracking-widest text-stone">{SERVICE_LABELS[s.serviceType].toUpperCase()}</Text>
        <Text className="mt-1 font-bold text-brand-ink">{s.name}</Text>
        <Text className="mt-1 text-brand-ink">{s.minPrice ? `Từ ${s.minPrice.toLocaleString('vi-VN')} xu` : 'Liên hệ giá'}{s.deliveryDays ? ` · ${s.deliveryDays} ngày` : ''}</Text>
        {!!commissionLabel(s) && <Text className="mt-1 text-sm text-stone">{commissionLabel(s)}</Text>}
      </Pressable>)}

      {!!person.works.truyen.length && <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Truyện chữ · {person.works.truyen.length}</Text>}
      {person.works.truyen.map(b => <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/truyen/[bookId]', params: { bookId: b.id } })}
        className="mb-2 flex-row items-center gap-3 rounded-2xl border border-cream-border bg-white p-3">
        {b.imageUrl ? <Image source={{ uri: b.imageUrl }} accessibilityIgnoresInvertColors style={{ width: 44, height: 62, borderRadius: 6 }} /> : null}
        <View className="flex-1"><Text className="font-bold text-brand-ink">{b.title}</Text><Text className="text-sm text-stone">{b.meta} · {b.date}</Text></View>
      </Pressable>)}

      {!!tracks.length && <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Audio · {tracks.length}</Text>}
      {tracks.map(t => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Nghe ${t.title}`}
        onPress={() => { void audio.play(t, tracks); router.push('/audio/player'); }}
        className="mb-2 rounded-2xl border border-cream-border bg-white p-4">
        <Text className="font-bold text-brand-ink">▶ {t.title}</Text>
      </Pressable>)}

      {!!person.works.design.length && <Text className="mb-2 mt-6 text-lg font-bold text-brand-ink">Thiết kế · {person.works.design.length}</Text>}
      <View className="flex-row flex-wrap gap-2">
        {person.works.design.map(d => d.imageUrl && <Image key={d.id} source={{ uri: d.imageUrl }} accessibilityLabel={d.title}
          style={{ width: '31%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#eceae7' }} />)}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
