import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useAuth } from '../../../src/providers/AuthProvider';
import { Button, Check, Field, Notice, ScreenHeader } from '../../../src/components/Form';
import {
  clearLocalDraft, getMyChapter, MAX_CONTENT, readLocalDraft, saveChapter, wordCount, writeLocalDraft,
  type EditableChapter,
} from '../../../src/services/authoring';
import { promptMissingAgreement } from '../../../src/services/agreement-prompt';
import { ChapterCharacters } from '../../../src/components/ChapterCharacters';

// The web chapter editor (/author/[bookId]/[chapterId]) as plain text: paragraphs are separated by a
// blank line, exactly as the reader splits them. No B/I/H2 buttons — the reader shows no markdown.
export default function ChapterEditorScreen() {
  const { session, loading } = useAuth();
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session || typeof chapterId !== 'string') return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để sáng tác →</Text></Pressable>
  </SafeAreaView>;
  return <Loader key={`${session.user.id}:${chapterId}`} userId={session.user.id} chapterId={chapterId} />;
}

function Loader({ userId, chapterId }: { userId: string; chapterId: string }) {
  const [data, setData] = useState<EditableChapter | null>(null);
  const [initial, setInitial] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getMyChapter(userId, chapterId), readLocalDraft(userId, chapterId)]).then(([next, local]) => {
      if (!active) return;
      const server = { title: next.chapter.title, content: next.chapter.content };
      const differs = local && !next.chapter.removed && (local.title !== server.title || local.content !== server.content);
      if (!differs) { setData(next); setInitial(server); return; }
      Alert.alert('Có bản chưa lưu trên máy', `Bản sửa lúc ${new Date(local.savedAt).toLocaleString('vi-VN')} chưa được lưu lên máy chủ. Dùng bản này?`, [
        { text: 'Dùng bản máy chủ', style: 'destructive', onPress: () => { clearLocalDraft(userId, chapterId); if (active) { setData(next); setInitial(server); } } },
        { text: 'Dùng bản trên máy', onPress: () => { if (active) { setData(next); setInitial({ title: local.title, content: local.content }); } } },
      ], { cancelable: false });
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được chương.'); });
    return () => { active = false; };
  }, [userId, chapterId]);
  if (!data || !initial) return <SafeAreaView className="flex-1 bg-cream-card">
    <View className="p-5">
      <ScreenHeader title="Soạn chương" onBack={() => router.canGoBack() ? router.back() : router.replace('/sang-tac')} />
      {error ? <Text className="text-red-700">{error}</Text> : <ActivityIndicator color="#143b4d" />}
    </View>
  </SafeAreaView>;
  return <Editor userId={userId} data={data} initial={initial} />;
}

function Editor({ userId, data, initial }: { userId: string; data: EditableChapter; initial: { title: string; content: string } }) {
  const { chapter, book } = data;
  const navigation = useNavigation();
  const [saved, setSaved] = useState({ title: chapter.title, content: chapter.content, price: chapter.price, published: chapter.published, isLastChapter: chapter.isLastChapter });
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [price, setPrice] = useState(String(chapter.price));
  const [markLast, setMarkLast] = useState(chapter.isLastChapter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const locked = chapter.removed;
  const priceValue = Number(price);
  const priceValid = /^\d+$/.test(price) && Number.isSafeInteger(priceValue);
  const textDirty = title !== saved.title || content !== saved.content;
  const dirty = textDirty || (priceValid && priceValue !== saved.price) || markLast !== saved.isLastChapter;

  // Keep unsaved text on the device (debounced) until the server has it.
  useEffect(() => {
    if (locked) return;
    const timer = setTimeout(() => {
      if (textDirty) writeLocalDraft(userId, chapter.id, { title, content }); else clearLocalDraft(userId, chapter.id);
    }, 1500);
    return () => clearTimeout(timer);
  }, [userId, chapter.id, title, content, textDirty, locked]);

  // Leaving with unsaved changes asks first (the text is still kept on the device).
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty && !busy; }, [dirty, busy]);
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (!dirtyRef.current) return;
    event.preventDefault();
    Alert.alert('Chưa lưu thay đổi', 'Nội dung đang sửa vẫn được giữ trên máy này để lần sau mở lại.', [
      { text: 'Ở lại', style: 'cancel' },
      { text: 'Rời đi', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
    ]);
  }), [navigation]);

  async function save(published: boolean) {
    if (lock.current || locked) return;
    if (!title.trim()) { setError('Tên chương không được để trống.'); return; }
    if (!priceValid) { setError('Giá chương phải là số nguyên từ 0 trở lên.'); return; }
    if (published && !content.trim()) { setError('Chương chưa có nội dung.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await saveChapter(userId, chapter.id, {
        title: title.trim(), content, published, price: priceValue, ...(markLast && !saved.isLastChapter ? { is_last_chapter: true } : {}),
      });
      clearLocalDraft(userId, chapter.id);
      setTitle(title.trim());
      setSaved({ title: title.trim(), content, price: priceValue, published, isLastChapter: markLast });
      setNotice(published ? (saved.published ? 'Đã cập nhật chương.' : 'Đã xuất bản chương.') : 'Đã lưu nháp.');
    } catch (e) {
      if (!promptMissingAgreement(e)) setError(e instanceof Error ? e.message : 'Lưu thất bại.');
    } finally { lock.current = false; setBusy(false); }
  }
  const toggleLast = () => {
    if (saved.isLastChapter || locked) return;
    if (markLast) { setMarkLast(false); return; }
    Alert.alert('Đánh dấu chương cuối?', 'Sau khi lưu, không thể bỏ đánh dấu và truyện hiện là “Đã hoàn thành”. Mỗi truyện chỉ có một chương cuối.', [
      { text: 'Hủy', style: 'cancel' }, { text: 'Đánh dấu', onPress: () => setMarkLast(true) },
    ]);
  };

  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={book.title} onBack={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/sang-tac/[bookId]', params: { bookId: book.id } })} />
        <Text className="mb-4 text-stone">{saved.published ? 'Đã đăng' : 'Nháp'}{book.isExclusive ? ' · Truyện độc quyền' : ''}</Text>
        {locked && <Text accessibilityLiveRegion="polite" className="mb-4 rounded-xl bg-white p-4 leading-6 text-red-700">
          Chương này đã bị quản trị viên gỡ{chapter.removedReason ? ` (${chapter.removedReason})` : ''} — không thể sửa cho tới khi được khôi phục. Xem Tin nhắn để biết chi tiết.
        </Text>}
        <Field label="Tên chương" value={title} onChangeText={setTitle} editable={!busy && !locked} maxLength={200} autoCorrect />
        <Field label="Nội dung" value={content} onChangeText={setContent} editable={!busy && !locked} multiline autoCorrect maxLength={MAX_CONTENT}
          hint={`${wordCount(content).toLocaleString('vi-VN')} từ · ${content.length.toLocaleString('vi-VN')}/${MAX_CONTENT.toLocaleString('vi-VN')} ký tự · Cách một dòng trống để tách đoạn.${saved.published ? ' Sửa chương đã đăng có thể làm lệch bình luận theo đoạn.' : ''}`}
          style={{ minHeight: 360, textAlignVertical: 'top' }} />
        <Field label="Giá chương (xu, 0 = miễn phí)" value={price} onChangeText={setPrice} editable={!busy && !locked} keyboardType="number-pad" maxLength={7}
          error={priceValid ? undefined : 'Nhập số nguyên từ 0 trở lên.'} />
        <ChapterCharacters userId={userId} chapterId={chapter.id} bookId={book.id} characters={data.characters} initial={data.taggedCharacterIds} disabled={locked} />
        <Check checked={markLast} onToggle={toggleLast}>
          <Text className="font-bold text-brand-ink">Đây là chương cuối</Text>
          <Text className="mt-1 leading-5 text-stone">{saved.isLastChapter ? 'Đã đánh dấu — không thể bỏ.' : 'Không thể bỏ đánh dấu sau khi lưu.'}</Text>
        </Check>
        <Notice message={error} />
        <Notice message={notice} tone="success" />
        {!locked && <>
          <Button label={busy ? 'Đang lưu…' : saved.published ? 'Cập nhật' : 'Xuất bản'} disabled={busy || (saved.published && !dirty)} onPress={() => void save(true)} />
          <Button label={busy ? 'Đang lưu…' : saved.published ? 'Chuyển về nháp' : 'Lưu nháp'} disabled={busy || (!saved.published && !dirty)} secondary onPress={() => {
            if (!saved.published) { void save(false); return; }
            Alert.alert('Chuyển về nháp?', 'Độc giả sẽ không đọc được chương này cho tới khi bạn xuất bản lại.', [
              { text: 'Hủy', style: 'cancel' }, { text: 'Chuyển về nháp', style: 'destructive', onPress: () => void save(false) },
            ]);
          }} />
        </>}
        {saved.published && !dirty && <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/doc/[chapterId]', params: { chapterId: chapter.id } })} className="mt-4 min-h-12 items-center justify-center">
          <Text className="font-bold text-brand-ink">Xem như độc giả →</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
