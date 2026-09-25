import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from './Avatar';
import { interact, shareAndRecord, tropeLabel, webLink, type ChapterInteractions } from '../services/reading';

/** End-of-chapter block: chapter vote, character trope vote, author follow and story share (same rules as the web reader). */
export function ChapterEngagement({ userId, chapterId, chapterTitle, state, onChange, colors }: {
  userId: string; chapterId: string; chapterTitle: string; state: ChapterInteractions;
  onChange: (patch: Partial<ChapterInteractions>) => void; colors: { text: string; muted: string; panel: string };
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function run(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(''); }
  }
  const chip = (label: string, selected: boolean, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button"
    accessibilityState={{ selected, disabled }} disabled={disabled || !!busy} onPress={onPress}
    style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, margin: 4,
      borderColor: selected ? colors.text : colors.muted, backgroundColor: selected ? colors.panel : 'transparent', opacity: busy ? 0.6 : 1 }}>
    <Text style={{ color: colors.text, fontWeight: selected ? '700' : '400' }}>{label}</Text>
  </Pressable>;
  const author = state.author;
  return <View style={{ backgroundColor: colors.panel, borderRadius: 18, padding: 18, marginBottom: 24 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {chip(`${state.voted ? '♥' : '♡'} Bình chọn · ${state.voteCount}`, state.voted, () => void run('vote', async () => {
        const r = await interact<{ voted: boolean; voteCount: number }>(userId, chapterId, 'vote');
        onChange({ voted: r.voted, voteCount: r.voteCount });
      }))}
      {chip('Chia sẻ truyện', false, () => void run('share', async () => {
        const link = webLink(`/truyen/${state.bookSlug}`);
        await shareAndRecord(userId, chapterId, state.bookId, `${chapterTitle} — ${state.bookTitle}${author.nickname ? ` · ${author.nickname}` : ''}${link ? `\n${link}` : ''}`);
      }))}
    </View>

    {!!state.tropeCandidates.length && <>
      <Text style={{ color: colors.text, fontWeight: '700', marginTop: 14 }}>Nhân vật nổi bật chương này</Text>
      <Text style={{ color: colors.muted, marginBottom: 4 }}>Chọn một nhân vật — có thể đổi lựa chọn sau.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {state.tropeCandidates.map(c => chip(tropeLabel(c), state.myTropeCharacterId === c.id, () => void run('trope', async () => {
          await interact(userId, chapterId, 'trope-vote', { characterId: c.id });
          onChange({ myTropeCharacterId: c.id });
        }), state.myTropeCharacterId === c.id))}
      </View>
    </>}

    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/nguoi-dung/[userId]', params: { userId: author.id } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 44 }}>
        <Avatar person={author} size={40} />
        <Text style={{ color: colors.text, fontWeight: '700', flexShrink: 1 }}>{author.nickname ?? 'Tác giả'}</Text>
      </Pressable>
      {!state.isOwnBook && chip(state.followingAuthor ? 'Đang theo dõi' : 'Theo dõi', state.followingAuthor, () => void run('follow', async () => {
        const r = await interact<{ following: boolean }>(userId, chapterId, 'follow-author', { authorId: author.id });
        onChange({ followingAuthor: r.following });
      }))}
    </View>
    {!!error && <Text accessibilityLiveRegion="polite" style={{ color: '#b91c1c', marginTop: 8 }}>{error}</Text>}
  </View>;
}
