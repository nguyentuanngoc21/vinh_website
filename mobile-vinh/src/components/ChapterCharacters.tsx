import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { setChapterCharacters, type Character } from '../services/authoring';

/**
 * The web ChapterCharactersPanel: tap to tag/untag the book's characters in this chapter. Each change
 * replaces the chapter's whole tag set (PUT), saved immediately; a failure restores the previous set.
 */
export function ChapterCharacters({ userId, chapterId, bookId, characters, initial, disabled }: {
  userId: string; chapterId: string; bookId: string; characters: Character[]; initial: string[]; disabled?: boolean;
}) {
  const [tagged, setTagged] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function toggle(id: string) {
    if (lock.current || disabled) return;
    const previous = tagged;
    const next = previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id];
    lock.current = true; setBusy(true); setError(''); setTagged(next);
    try { await setChapterCharacters(userId, chapterId, next); }
    catch (e) { setTagged(previous); setError(e instanceof Error ? e.message : 'Chưa lưu được nhân vật.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View className="mb-4">
    <Text className="mb-2 text-brand-ink">Nhân vật xuất hiện trong chương</Text>
    {!characters.length ? <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/sang-tac/[bookId]', params: { bookId } })} className="min-h-11 justify-center">
      <Text className="text-stone">Truyện chưa có nhân vật — thêm ở trang tác phẩm →</Text></Pressable>
      : <View className="flex-row flex-wrap gap-2">
        {characters.map(c => {
          const on = tagged.includes(c.id);
          return <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: busy || !!disabled }} disabled={busy || disabled}
            onPress={() => void toggle(c.id)} className={`min-h-11 justify-center rounded-full border px-4 ${on ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
            <Text className={on ? 'font-bold text-white' : 'text-brand-ink'}>{on ? '✓ ' : ''}{c.name}</Text>
          </Pressable>;
        })}
      </View>}
    {!!error && <Text accessibilityLiveRegion="polite" className="mt-2 text-red-700">{error}</Text>}
  </View>;
}
