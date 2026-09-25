import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { Button, Check, Field, Notice, ScreenHeader } from '../../src/components/Form';
import {
  addChapters, batchChapters, createBook, extractDocx, MAX_CONTENT, MAX_DOCX_BYTES, readTextFile, type HeadingChapter,
} from '../../src/services/authoring';
import { countWords, MAX_DETECTED_CHAPTERS, splitChapters, type SplitMode } from '../../src/services/split-chapters';
import { promptMissingAgreement } from '../../src/services/agreement-prompt';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
type Mode = SplitMode | 'heading';
const MODES: [Mode, string][] = [['heading', 'Theo Heading (Word)'], ['chuong', 'Theo "Chương N"'], ['blank', 'Theo 3 dòng trống'], ['none', 'Một chương']];

// The web ImportManuscriptModal: .txt / .docx / pasted text → detected chapters → a new book or the
// end of an existing one (?bookId=). Chapters are split on the device with the web's own rules.
export default function ImportManuscript() {
  const { session, loading } = useAuth();
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card">
    <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để sáng tác →</Text></Pressable>
  </SafeAreaView>;
  return <Importer key={session.user.id} userId={session.user.id} bookId={typeof bookId === 'string' && bookId ? bookId : null} />;
}

function Importer({ userId, bookId }: { userId: string; bookId: string | null }) {
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [headings, setHeadings] = useState<HeadingChapter[]>([]);
  const [mode, setMode] = useState<Mode>('chuong');
  const [pasted, setPasted] = useState('');
  const [title, setTitle] = useState('');
  const [isExclusive, setIsExclusive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [partialBookId, setPartialBookId] = useState<string | null>(null);
  const lock = useRef(false);

  const result = useMemo(() => {
    if (text === null) return null;
    if (mode === 'heading') return { chapters: headings.slice(0, MAX_DETECTED_CHAPTERS), truncated: headings.length > MAX_DETECTED_CHAPTERS, fellBackToSingle: false };
    return splitChapters(text, mode);
  }, [text, mode, headings]);
  const detected = result?.chapters ?? [];
  const tooLong = detected.filter(c => c.content.length > MAX_CONTENT);

  function start(value: string, label: string, headingChapters: HeadingChapter[] = []) {
    setText(value); setSource(label); setHeadings(headingChapters); setError('');
    // Real Word Heading styles are more reliable than guessing "Chương N" — preselect them, as the web does.
    setMode(headingChapters.length > 0 ? 'heading' : 'chuong');
  }
  async function pick() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['text/plain', DOCX], multiple: false, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const name = file.name.toLowerCase();
      if (name.endsWith('.docx')) {
        if (file.size != null && file.size > MAX_DOCX_BYTES) throw new Error('Tệp .docx tối đa 4 MB.');
        setProgress('Đang đọc tệp .docx…');
        const data = await extractDocx(userId, { uri: file.uri, name: file.name, mimeType: file.mimeType });
        start(data.text, file.name, data.headingChapters);
      } else if (name.endsWith('.txt')) {
        const value = await readTextFile(file.uri);
        if (!value.trim()) throw new Error('Tệp không có nội dung.');
        start(value, file.name);
      } else throw new Error('Chỉ hỗ trợ tệp .txt hoặc .docx (không hỗ trợ .doc, .epub).');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được tệp.'); }
    finally { lock.current = false; setBusy(false); setProgress(''); }
  }

  async function confirm() {
    if (lock.current || !detected.length || tooLong.length) return;
    lock.current = true; setBusy(true); setError('');
    const chapters = detected.map(c => ({ title: c.title, content: c.content }));
    let target = bookId;
    try {
      let rest = chapters;
      if (!target) {
        setProgress('Đang tạo truyện…');
        const [first, ...others] = chapters;
        const created = await createBook(userId, {
          title: title.trim() || first.title || 'Bản thảo mới', isExclusive, chapterTitle: first.title, chapterContent: first.content,
          published: false, price: 0, isLastChapter: false,
        });
        target = created.bookId;
        rest = others;
      }
      const batches = batchChapters(rest);
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Đang thêm chương (${i + 1}/${batches.length})…`);
        await addChapters(userId, target, batches[i]);
      }
      router.replace({ pathname: '/sang-tac/[bookId]', params: { bookId: target } });
    } catch (e) {
      if (promptMissingAgreement(e)) return;
      const message = e instanceof Error ? e.message : 'Không nhập được bản thảo.';
      // Part of the manuscript may already be saved; show the book so nothing is imported twice.
      if (target && target !== bookId) setError(`${message} Truyện đã được tạo — mở trang tác phẩm để kiểm tra các chương đã thêm.`);
      else setError(`${message} Một phần chương có thể đã được thêm — hãy kiểm tra trang tác phẩm trước khi nhập lại.`);
      setPartialBookId(target);
    } finally { lock.current = false; setBusy(false); setProgress(''); }
  }

  const back = () => router.canGoBack() ? router.back() : router.replace('/sang-tac');
  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Nhập bản thảo" onBack={back} />
        <Text className="mb-4 leading-6 text-stone">{bookId ? 'Các chương sẽ được thêm vào cuối truyện này, ở dạng nháp.' : 'Tạo truyện mới từ bản thảo; mọi chương ở dạng nháp.'}</Text>
        {text === null ? <>
          <Button label={busy ? progress || 'Đang mở…' : 'Chọn tệp .txt hoặc .docx'} disabled={busy} onPress={() => void pick()} />
          <Text className="mb-4 mt-2 text-sm text-stone">.docx tối đa 4 MB. Không hỗ trợ .doc, .epub.</Text>
          <Field label="Hoặc dán văn bản" value={pasted} onChangeText={setPasted} editable={!busy} multiline autoCorrect
            style={{ minHeight: 180, textAlignVertical: 'top' }} />
          <Button label="Tiếp tục" secondary disabled={busy || !pasted.trim()} onPress={() => start(pasted, `${countWords(pasted).toLocaleString('vi-VN')} chữ đã dán`)} />
        </> : <>
          <Text className="mb-3 font-bold text-brand-ink">{source}</Text>
          <Text className="mb-2 text-brand-ink">Cách tách chương</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {MODES.filter(([id]) => id !== 'heading' || headings.length > 0).map(([id, label]) => <Pressable key={id} accessibilityRole="radio"
              accessibilityState={{ selected: mode === id }} disabled={busy} onPress={() => setMode(id)}
              className={`min-h-11 justify-center rounded-full border px-4 ${mode === id ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
              <Text className={mode === id ? 'font-bold text-white' : 'text-brand-ink'}>{label}</Text>
            </Pressable>)}
          </View>
          {result?.fellBackToSingle && <Text className="mb-2 leading-5 text-stone">Không tìm thấy dòng “Chương N” nào — toàn bộ văn bản là một chương.</Text>}
          {result?.truncated && <Text className="mb-2 leading-5 text-red-700">Phát hiện hơn {MAX_DETECTED_CHAPTERS} chương — chỉ nhập {MAX_DETECTED_CHAPTERS} chương đầu. Hãy tách tệp để nhập phần còn lại.</Text>}
          {!!tooLong.length && <Text className="mb-2 leading-5 text-red-700">Chương quá dài (tối đa {MAX_CONTENT.toLocaleString('vi-VN')} ký tự): {tooLong.map(c => c.title).join(', ')}. Hãy chọn cách tách khác.</Text>}
          <Text className="mb-2 text-brand-ink">{detected.length} chương</Text>
          {detected.slice(0, 50).map((c, i) => <View key={`${i}:${c.title}`} className="mb-2 rounded-xl border border-cream-border bg-white p-3">
            <Text className="font-bold text-brand-ink" numberOfLines={2}>{c.title}</Text>
            <Text className={`text-sm ${c.content.length > MAX_CONTENT ? 'text-red-700' : 'text-stone'}`}>{c.words.toLocaleString('vi-VN')} chữ</Text>
          </View>)}
          {detected.length > 50 && <Text className="mb-2 text-stone">… và {detected.length - 50} chương nữa.</Text>}
          {!bookId && <View className="mt-4">
            <Field label="Tên truyện mới" value={title} onChangeText={setTitle} editable={!busy} maxLength={200} placeholder={detected[0]?.title || 'Bản thảo mới'} autoCorrect />
            <Check checked={isExclusive} onToggle={() => !busy && setIsExclusive(v => !v)}>
              <Text className="font-bold text-brand-ink">Độc quyền trên Vịnh</Text>
              <Text className="mt-1 leading-5 text-stone">Cần xác nhận Chính sách độc quyền xuất bản. Có thể đổi ở trang tác phẩm trước khi xuất bản.</Text>
            </Check>
          </View>}
          <Notice message={error} />
          {partialBookId ? <Button label="Mở trang tác phẩm" onPress={() => router.replace({ pathname: '/sang-tac/[bookId]', params: { bookId: partialBookId } })} />
          : <Button label={busy ? progress || 'Đang nhập…' : `Nhập ${detected.length} chương`} disabled={busy || !detected.length || !!tooLong.length} onPress={() => void confirm()} />}
          {!partialBookId && <Button label="Chọn lại nguồn" secondary disabled={busy} onPress={() => { setText(null); setError(''); }} />}
        </>}
        {text === null && <Notice message={error} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
