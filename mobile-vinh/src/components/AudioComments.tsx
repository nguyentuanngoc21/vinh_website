import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice } from './Form';
import { audioCommentAction, getAudioComments, type AudioComment } from '../services/audio';

const BODY_MAX = 2000; // same limit as /api/audio/[id]/comments

/** Comments under a narration, like the web now-playing panel: one reply level, likes, delete own. */
export function AudioComments({ userId, audioId, title, visible, onClose }: { userId: string; audioId: string; title: string; visible: boolean; onClose: () => void }) {
  const [comments, setComments] = useState<AudioComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<AudioComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(() => getAudioComments(userId, audioId).then(setComments), [userId, audioId]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    getAudioComments(userId, audioId).then(list => { if (active) setComments(list); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được bình luận.'); });
    return () => { active = false; };
  }, [visible, userId, audioId]);
  async function run(task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(false); }
  }
  const top = (comments ?? []).filter(c => !c.parentCommentId);
  const item = (c: AudioComment, reply = false) => <View key={c.id} className={`mb-3 rounded-xl bg-white p-3 ${reply ? 'ml-6' : ''}`}>
    <Text className="font-bold text-brand-ink">{c.authorName ?? 'Người dùng'}</Text>
    <Text selectable className="mt-1 leading-6 text-brand-ink">{c.content}</Text>
    <View className="mt-1 flex-row gap-4">
      <Pressable accessibilityRole="button" accessibilityState={{ selected: c.liked }} disabled={busy}
        onPress={() => void run(() => audioCommentAction(userId, audioId, 'like', { commentId: c.id }))} className="min-h-10 justify-center">
        <Text className="text-brand-ink">{c.liked ? '♥' : '♡'} {c.likeCount}</Text></Pressable>
      {!reply && <Pressable accessibilityRole="button" onPress={() => setReplyTo(c)} className="min-h-10 justify-center"><Text className="text-stone">Trả lời</Text></Pressable>}
      {c.isOwn && <Pressable accessibilityRole="button" disabled={busy} className="min-h-10 justify-center" onPress={() => Alert.alert('Xoá bình luận?', '', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xoá', style: 'destructive', onPress: () => void run(() => audioCommentAction(userId, audioId, 'delete', { commentId: c.id })) }])}>
        <Text className="text-red-700">Xoá</Text></Pressable>}
    </View>
  </View>;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-cream-card">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-5 pb-2">
          <Text accessibilityRole="header" numberOfLines={1} className="flex-1 text-xl font-bold text-brand-ink">Bình luận · {title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} className="min-h-12 min-w-12 items-center justify-center">
            <Text className="text-2xl text-brand-ink">×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {!comments && !error && <ActivityIndicator color="#143b4d" />}
          {comments && !top.length && <Text className="text-stone">Chưa có bình luận.</Text>}
          {top.map(t => <View key={t.id}>{item(t)}{(comments ?? []).filter(r => r.parentCommentId === t.id).map(r => item(r, true))}</View>)}
        </ScrollView>
        <View className="border-t border-cream-border p-4">
          {replyTo && <Pressable onPress={() => setReplyTo(null)} className="mb-2 min-h-10 justify-center">
            <Text className="text-stone">Đang trả lời {replyTo.authorName ?? 'bình luận'} · bỏ ×</Text></Pressable>}
          <TextInput accessibilityLabel="Nội dung bình luận" value={draft} onChangeText={setDraft} editable={!busy} multiline maxLength={BODY_MAX}
            placeholder="Viết bình luận…" placeholderTextColor="#8a8178" style={{ maxHeight: 120 }}
            className="rounded-xl border border-cream-border bg-white px-4 py-3 text-base text-brand-ink" />
          <Button label={busy ? 'Đang gửi…' : 'Gửi bình luận'} disabled={busy || !draft.trim()} onPress={() => void run(async () => {
            await audioCommentAction(userId, audioId, 'comment', { content: draft.trim(), parentCommentId: replyTo?.id ?? null });
            setDraft(''); setReplyTo(null);
          })} />
          <Notice message={error} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
