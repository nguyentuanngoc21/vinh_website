import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { BookInfoForm, type BookInfo } from '../../src/components/BookInfoForm';
import { Button, Field, Notice, ScreenHeader } from '../../src/components/Form';
import { createBook, MAX_CONTENT, parseTags, wordCount } from '../../src/services/authoring';
import { promptMissingAgreement } from '../../src/services/agreement-prompt';

// The web /author/new: nothing is written until the first Lưu nháp / Xuất bản, which creates the
// book and its first chapter in one request (POST /api/authoring/books).
export default function NewWork() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để sáng tác →</Text></Pressable>
  </SafeAreaView>;
  return <Editor key={session.user.id} userId={session.user.id} />;
}

function Editor({ userId }: { userId: string }) {
  // Exclusive by default, as on the web.
  const [info, setInfo] = useState<BookInfo>({ title: '', genre: null, synopsis: '', tags: '', isExclusive: true });
  const [chapterTitle, setChapterTitle] = useState('Chương 1');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const priceValue = Number(price);
  const priceValid = /^\d+$/.test(price) && Number.isSafeInteger(priceValue);

  async function save(published: boolean) {
    if (lock.current) return;
    if (!info.title.trim()) { setError('Hãy nhập tên truyện.'); return; }
    if (!priceValid) { setError('Giá chương phải là số nguyên từ 0 trở lên.'); return; }
    if (published && !content.trim()) { setError('Chương đầu chưa có nội dung.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const { bookId } = await createBook(userId, {
        title: info.title.trim(), synopsis: info.synopsis, genre: info.genre ?? undefined, tags: parseTags(info.tags),
        isExclusive: info.isExclusive, chapterTitle: chapterTitle.trim() || 'Chương 1', chapterContent: content,
        published, price: priceValue, isLastChapter: false,
      });
      router.replace({ pathname: '/sang-tac/[bookId]', params: { bookId } });
    } catch (e) {
      if (!promptMissingAgreement(e)) setError(e instanceof Error ? e.message : 'Chưa lưu được tác phẩm.');
    } finally { lock.current = false; setBusy(false); }
  }

  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Tác phẩm mới" onBack={() => router.canGoBack() ? router.back() : router.replace('/sang-tac')} />
        <BookInfoForm value={info} onChange={setInfo} disabled={busy} />
        <Text className="mb-3 mt-6 text-lg font-bold text-brand-ink">Chương đầu tiên</Text>
        <Field label="Tên chương" value={chapterTitle} onChangeText={setChapterTitle} editable={!busy} maxLength={200} autoCorrect />
        <Field label="Nội dung" value={content} onChangeText={setContent} editable={!busy} multiline autoCorrect maxLength={MAX_CONTENT}
          hint={`${wordCount(content).toLocaleString('vi-VN')} từ · Cách một dòng trống để tách đoạn.`}
          style={{ minHeight: 260, textAlignVertical: 'top' }} />
        <Field label="Giá chương (xu, 0 = miễn phí)" value={price} onChangeText={setPrice} editable={!busy} keyboardType="number-pad" maxLength={7}
          error={priceValid ? undefined : 'Nhập số nguyên từ 0 trở lên.'} />
        <Notice message={error} />
        <Button label={busy ? 'Đang lưu…' : 'Lưu nháp'} disabled={busy} secondary onPress={() => void save(false)} />
        <Button label={busy ? 'Đang lưu…' : 'Xuất bản'} disabled={busy} onPress={() => void save(true)} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
