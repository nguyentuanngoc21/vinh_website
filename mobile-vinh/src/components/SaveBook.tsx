import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { createReadingList, getBookLists, setBookSaved } from '../services/library';

export function SaveBook({ bookId, onClose }: { bookId: string; onClose?: () => void }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  function close() { setOpen(false); onClose?.(); }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Lưu truyện vào Tủ sách" onPress={() => session ? setOpen(true) : router.push('/(tabs)/ca-nhan')}
      style={{ backgroundColor: '#143b4d', borderRadius: 12, padding: 12, margin: 4 }}><Text style={{ color: '#fff' }}>Lưu truyện</Text></Pressable>
    <Modal visible={open && !!session} animationType="slide" onRequestClose={close}>
      {open && session && <SaveBookPanel key={session.user.id} userId={session.user.id} bookId={bookId} close={close} />}
    </Modal>
  </>;
}
function SaveBookPanel({ userId, bookId, close }: { userId: string; bookId: string; close: () => void }) {
  const [lists, setLists] = useState<Awaited<ReturnType<typeof getBookLists>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    getBookLists(userId, bookId).then(data => { if (active) setLists(data); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, bookId, attempt]);
  async function change(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được. Vui lòng thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView className="flex-1 bg-cream-card"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View className="mb-6 flex-row items-center justify-between"><Text className="text-2xl font-bold text-brand-ink">Lưu vào Tủ sách</Text>
      <Pressable accessibilityRole="button" onPress={close} className="p-3"><Text className="text-brand-ink">Xong</Text></Pressable></View>
    <Text className="mb-5 leading-6 text-stone">Chọn danh sách để lưu hoặc bỏ lưu truyện. Danh sách được dùng chung với website Vịnh.</Text>
    {(loading || busy) && <ActivityIndicator color="#143b4d" />}
    {!!error && <View className="my-4"><Text accessibilityLiveRegion="polite" className="text-red-700">{error}</Text>
      <Pressable disabled={busy} onPress={() => { setError(''); setLoading(true); setAttempt(a => a + 1); }} className="py-3"><Text className="text-brand-ink">Tải lại danh sách</Text></Pressable></View>}
    {lists.map(list => <Pressable key={list.id} accessibilityRole="checkbox" accessibilityState={{ checked: list.contains, disabled: busy }} disabled={busy}
      onPress={() => void change(async () => { await setBookSaved(userId, list.id, bookId, !list.contains);
        setLists(all => all.map(l => l.id === list.id ? { ...l, contains: !list.contains } : l)); })}
      className="mb-3 flex-row justify-between rounded-2xl border border-cream-border p-5">
      <Text className="flex-1 text-base text-brand-ink">{list.name}</Text><Text className="text-brand-ink">{list.contains ? '✓ Đã lưu' : '+ Lưu'}</Text>
    </Pressable>)}
    {!loading && !lists.length && !error && <Text className="my-4 text-stone">Bạn chưa có danh sách đọc. Tạo danh sách đầu tiên bên dưới.</Text>}
    <Text className="mb-3 mt-6 font-bold text-brand-ink">Danh sách mới</Text>
    <TextInput accessibilityLabel="Tên danh sách mới" placeholder="Ví dụ: Đọc cuối tuần" placeholderTextColor="#8a8178" value={name} onChangeText={setName}
      editable={!busy} maxLength={80} className="rounded-xl border border-cream-border bg-white p-4 text-brand-ink" />
    <Pressable accessibilityRole="button" disabled={busy || loading || !name.trim()} onPress={() => void change(async () => {
      const list = await createReadingList(userId, name);
      setLists(all => [...all, { ...list, contains: false }]); setName('');
      await setBookSaved(userId, list.id, bookId, true);
      setLists(all => all.map(l => l.id === list.id ? { ...l, contains: true } : l));
    })} className="mt-4 rounded-xl bg-brand-ink p-4" style={{ opacity: busy || loading || !name.trim() ? 0.5 : 1 }}>
      <Text className="text-center font-bold text-white">Tạo danh sách và lưu truyện</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
