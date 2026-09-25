import { useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, Field, Notice } from './Form';
import { addCharacter, CHARACTER_ROLES, deleteCharacter, updateCharacter, type Character } from '../services/authoring';

const roleLabel = (role: string) => CHARACTER_ROLES.find(([id]) => id === role)?.[1] ?? role;

/**
 * The web CharacterManager on the book overview: add, edit and delete a book's characters
 * (name ≤ 60, role, optional trope ≤ 40). Deleting also removes chapter tags, follows and trope votes.
 */
export function CharacterManager({ userId, bookId, characters, onChanged }: {
  userId: string; bookId: string; characters: Character[]; onChanged: () => void;
}) {
  // null = closed, '' = adding a new one, id = editing that character.
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('neutral');
  const [trope, setTrope] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const open = (c?: Character) => {
    setEditing(c ? c.id : ''); setName(c?.name ?? ''); setRole(c?.role ?? 'neutral'); setTrope(c?.trope ?? ''); setError('');
  };
  async function run(task: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await task(); setEditing(null); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const save = () => {
    if (!name.trim()) { setError('Hãy nhập tên nhân vật.'); return; }
    const fields = { name: name.trim(), role, trope: trope.trim() || null };
    void run(() => editing ? updateCharacter(userId, bookId, editing, fields) : addCharacter(userId, bookId, fields));
  };
  const remove = (c: Character) => Alert.alert(`Xoá nhân vật “${c.name}”?`, 'Nhân vật sẽ bị gỡ khỏi mọi chương, kèm lượt theo dõi và bình chọn trope.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xoá', style: 'destructive', onPress: () => void run(() => deleteCharacter(userId, bookId, c.id)) },
  ]);

  return <View>
    {!characters.length && editing === null && <Text className="mb-2 leading-6 text-stone">Chưa có nhân vật. Thêm nhân vật để gắn vào chương và cho độc giả bình chọn trope.</Text>}
    {characters.map(c => <View key={c.id} className="mb-2 flex-row items-center gap-2 rounded-2xl border border-cream-border bg-white p-3">
      <View className="flex-1">
        <Text className="font-bold text-brand-ink">{c.name}</Text>
        <Text className="text-sm text-stone">{roleLabel(c.role)}{c.trope ? ` · ${c.trope}` : ''}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sửa ${c.name}`} disabled={busy} onPress={() => open(c)} className="min-h-11 justify-center px-2">
        <Text className="text-brand-ink">Sửa</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Xoá ${c.name}`} disabled={busy} onPress={() => remove(c)} className="min-h-11 justify-center px-2">
        <Text className="text-red-700">Xoá</Text></Pressable>
    </View>)}
    {editing === null ? <Button label="+ Thêm nhân vật" secondary disabled={busy} onPress={() => open()} />
      : <View className="mt-2 rounded-2xl border border-cream-border bg-white p-4">
        <Field label="Tên nhân vật" value={name} onChangeText={setName} maxLength={60} editable={!busy} autoCorrect />
        <Text className="mb-2 text-brand-ink">Vai trò</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {CHARACTER_ROLES.map(([id, label]) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: role === id }} disabled={busy} onPress={() => setRole(id)}
            className={`min-h-11 justify-center rounded-full border px-4 ${role === id ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-cream-card'}`}>
            <Text className={role === id ? 'font-bold text-white' : 'text-brand-ink'}>{label}</Text>
          </Pressable>)}
        </View>
        <Field label="Trope (tùy chọn)" value={trope} onChangeText={setTrope} maxLength={40} editable={!busy} placeholder="vd: Ma vương, Trượng nghĩa" autoCorrect />
        <Notice message={error} />
        <Button label={busy ? 'Đang lưu…' : editing ? 'Lưu nhân vật' : 'Thêm nhân vật'} disabled={busy} onPress={save} />
        <Button label="Hủy" secondary disabled={busy} onPress={() => setEditing(null)} />
      </View>}
    {editing === null && <Notice message={error} />}
  </View>;
}
