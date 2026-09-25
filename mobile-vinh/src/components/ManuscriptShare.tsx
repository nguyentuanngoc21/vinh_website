import { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Field, Notice } from './Form';
import { finalizeBook, shareManuscript, unshareManuscript, type BookDetail } from '../services/authoring';

/**
 * The web ShareManuscriptPanel: grant read access to exactly one account; revoke and share with
 * someone else until Hoàn thiện, which locks the grant permanently (DB trigger).
 */
export function ManuscriptShare({ userId, book, onChanged }: { userId: string; book: BookDetail; onChanged: () => void }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const grant = book.manuscriptGrant;
  async function run(task: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await task(); setUsername(''); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const finalize = () => Alert.alert('Hoàn thiện truyện này?', 'Sau khi Hoàn thiện, không thể gỡ hoặc chia sẻ lại bản thảo cho tài khoản khác. Không đảo ngược được.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Hoàn thiện', style: 'destructive', onPress: () => void run(() => finalizeBook(userId, book.id)) },
  ]);

  return <View>
    <Text className="mb-3 leading-6 text-stone">Cấp quyền xem bản thảo cho đúng 1 tài khoản — gỡ ra rồi chia sẻ người khác được, tới khi bạn bấm Hoàn thiện.</Text>
    {grant ? <View className="rounded-2xl border border-cream-border bg-white p-4">
      <Text className="font-bold text-brand-ink">{grant.nickname || grant.username} <Text className="font-normal text-stone">@{grant.username}</Text></Text>
      <Text className="mt-1 text-sm text-stone">Từ {new Date(grant.grantedAt).toLocaleDateString('vi-VN')}{book.finalized ? ' · Đã khóa (Hoàn thiện)' : ''}</Text>
      {!book.finalized && !grant.locked && <Button label={busy ? 'Đang gỡ…' : 'Gỡ chia sẻ'} secondary disabled={busy} onPress={() => void run(() => unshareManuscript(userId, book.id))} />}
    </View> : book.finalized ? <Text className="text-stone">Chưa từng chia sẻ — đã Hoàn thiện, không thể chia sẻ nữa.</Text>
      : <>
        <Field label="Tên tài khoản" value={username} onChangeText={setUsername} editable={!busy} autoCapitalize="none" placeholder="@tên tài khoản" />
        <Button label={busy ? 'Đang chia sẻ…' : 'Chia sẻ bản thảo'} disabled={busy || !username.trim()} onPress={() => void run(() => shareManuscript(userId, book.id, username.trim()))} />
      </>}
    <Notice message={error} />
    <Button label={book.finalized ? 'Đã Hoàn thiện — khóa vĩnh viễn' : 'Hoàn thiện (khóa chia sẻ vĩnh viễn)'} secondary disabled={busy || book.finalized} onPress={finalize} />
  </View>;
}
