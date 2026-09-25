import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice } from './Form';
import type { ParagraphComment } from '../services/reading';

type Thread = { top: ParagraphComment; replies: ParagraphComment[] };
const BODY_MAX = 2000; // same limit as /api/chapters/[chapterId]/comments

/** Bottom sheet for one paragraph's comments: threads (one reply level, like the web), post, reply, delete own. */
export function ParagraphComments({ paragraph, threads, onClose, onPost, onDelete }: {
  paragraph: { index: number; text: string } | null; threads: Thread[];
  onClose: () => void; onPost: (content: string, parentCommentId: string | null) => Promise<void>; onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ParagraphComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  const comment = (c: ParagraphComment, reply = false) => <View key={c.id} className={`mb-3 rounded-xl bg-white p-3 ${reply ? 'ml-6' : ''}`}>
    <Text className="font-bold text-brand-ink">{c.authorName ?? 'Người dùng'}</Text>
    <Text selectable className="mt-1 leading-6 text-brand-ink">{c.content}</Text>
    <View className="mt-1 flex-row gap-4">
      {!reply && <Pressable accessibilityRole="button" onPress={() => setReplyTo(c)} className="min-h-10 justify-center"><Text className="text-stone">Trả lời</Text></Pressable>}
      {c.isOwn && <Pressable accessibilityRole="button" disabled={busy} className="min-h-10 justify-center"
        onPress={() => Alert.alert('Xoá bình luận?', reply ? '' : 'Các trả lời của bình luận này cũng bị xoá.', [
          { text: 'Hủy', style: 'cancel' }, { text: 'Xoá', style: 'destructive', onPress: () => void run(() => onDelete(c.id)) }])}>
        <Text className="text-red-700">Xoá</Text></Pressable>}
    </View>
  </View>;
  return <Modal visible={!!paragraph} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-cream-card">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-5 pb-2">
          <Text accessibilityRole="header" className="text-xl font-bold text-brand-ink">Bình luận đoạn này</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} className="min-h-12 min-w-12 items-center justify-center">
            <Text className="text-2xl text-brand-ink">×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {!!paragraph && <Text numberOfLines={4} className="mb-4 border-l-2 border-brand-gold pl-3 italic leading-6 text-stone">{paragraph.text}</Text>}
          {!threads.length && <Text className="text-stone">Chưa có bình luận. Hãy là người đầu tiên.</Text>}
          {threads.map(t => <View key={t.top.id}>{comment(t.top)}{t.replies.map(r => comment(r, true))}</View>)}
        </ScrollView>
        <View className="border-t border-cream-border p-4">
          {replyTo && <Pressable onPress={() => setReplyTo(null)} className="mb-2 min-h-10 justify-center">
            <Text className="text-stone">Đang trả lời {replyTo.authorName ?? 'bình luận'} · bỏ ×</Text></Pressable>}
          <TextInput accessibilityLabel="Nội dung bình luận" value={draft} onChangeText={setDraft} editable={!busy} multiline maxLength={BODY_MAX}
            placeholder="Viết bình luận…" placeholderTextColor="#8a8178" style={{ maxHeight: 120 }}
            className="rounded-xl border border-cream-border bg-white px-4 py-3 text-base text-brand-ink" />
          <Button label={busy ? 'Đang gửi…' : 'Gửi bình luận'} disabled={busy || !draft.trim()} onPress={() => void run(async () => {
            await onPost(draft.trim(), replyTo?.id ?? null); setDraft(''); setReplyTo(null);
          })} />
          <Notice message={error} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
