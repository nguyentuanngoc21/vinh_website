import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getChapter, ReaderChapter } from '../../src/services/books';
import { themes, useReaderSettings } from '../../src/hooks/useReaderSettings';
import { useAuth } from '../../src/providers/AuthProvider';
import { SaveBook } from '../../src/components/SaveBook';
import { ReaderParagraphs } from '../../src/components/ReaderParagraphs';

export default function Reader() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <ReaderContent key={`${chapterId}:${session?.user.id ?? 'guest'}`} chapterId={chapterId} />;
}

function ReaderContent({ chapterId }: { chapterId: string }) {
  const { session } = useAuth();
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const { settings, setSettings, ready, storageError } = useReaderSettings();
  const colors = themes[settings.theme];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    getChapter(chapterId, controller.signal).then(data => { if (active) setChapter(data); })
      .catch(e => { if (active) setError(controller.signal.aborted ? 'Kết nối quá lâu. Vui lòng thử lại.' : e instanceof Error ? e.message : 'Không tải được chương.'); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [chapterId, attempt]);
  // Match the web Reader's indices exactly for cross-device restoration.
  const paragraphs = useMemo(() => chapter?.content ? chapter.content.split('\n\n') : [], [chapter]);
  function navigate(id: string | null) {
    if (id) router.replace({ pathname: '/doc/[chapterId]', params: { chapterId: id } });
  }
  const button = (label: string, action: () => void, selected = false, disabled = false) =>
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled}
      onPress={action} style={{ minHeight: 44, padding: 12, borderRadius: 12, borderWidth: 1,
        borderColor: selected ? colors.text : colors.muted, opacity: disabled ? 0.35 : 1, margin: 4 }}>
      <Text style={{ color: colors.text, fontWeight: selected ? '700' : '400' }}>{label}</Text>
    </Pressable>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={settings.theme === 'dark' ? 'light' : 'dark'} />
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.panel }}>
      {button('←', () => router.canGoBack() ? router.back() : router.replace('/'))}
      <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, marginHorizontal: 12 }}>{chapter?.bookTitle || 'Đọc truyện'}</Text>
      {chapter && button('Mục lục', () => router.replace({ pathname: '/truyen/[bookId]', params: { bookId: chapter.bookId } }))}
      {button('Aa', () => setShowSettings(true), false, !ready)}
    </View>
    {!chapter && !error && <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.text} /></View>}
    {!!error && <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text, marginBottom: 16 }}>{error}</Text>
      {button('Thử lại', () => { setError(''); setChapter(null); setAttempt(a => a + 1); })}
    </View>}
    {chapter && <ReaderParagraphs key={chapterId} userId={session?.user.id} bookId={chapter.bookId} chapterId={chapterId}
      canSave={chapter.gate === 'none'} paragraphs={paragraphs} settings={settings} textColor={colors.text}
      header={<View style={{ paddingVertical: 28 }}>
        <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 2, marginBottom: 18 }}>VỊNH · KHOẢNG LẶNG CỦA BẠN</Text>
        <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 29, lineHeight: 40 }}>{chapter.title}</Text>
        <View style={{ alignItems: 'flex-start', marginTop: 16 }}><SaveBook bookId={chapter.bookId} /></View>
        <View style={{ backgroundColor: colors.muted, height: 1, width: 44, marginTop: 28 }} />
      </View>}
      footer={<View style={{ paddingVertical: 28 }}>
        {chapter.gate !== 'none' ? <View style={{ backgroundColor: colors.panel, borderRadius: 18, padding: 22, marginBottom: 24 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
            {chapter.gate === 'purchase' ? `Chương khóa · ${chapter.price} xu` : 'Bạn vừa đọc hết phần đọc thử'}</Text>
          <Text style={{ color: colors.muted, lineHeight: 24 }}>{chapter.gate === 'login'
            ? 'Đăng nhập bằng tài khoản Vịnh để tiếp tục đọc.'
            : 'Chương này cần quyền truy cập. Nếu đã mua trên web, hãy đăng nhập đúng tài khoản. Mua chương trong app chưa được hỗ trợ.'}</Text>
          {button('Tài khoản / Đăng nhập', () => router.push('/(tabs)/ca-nhan'))}
        </View> : <Text style={{ color: colors.muted, textAlign: 'center', marginBottom: 24 }}>— Hết chương —</Text>}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {button('← Chương trước', () => navigate(chapter.previousId), false, !chapter.previousId)}
          {button('Chương sau →', () => navigate(chapter.nextId), false, !chapter.nextId)}
        </View>
      </View>} />}
    <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
      <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Đóng tùy chỉnh" onPress={() => setShowSettings(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }}>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Không gian đọc</Text>
              {button('Xong', () => setShowSettings(false))}
            </View>
            <Text style={{ color: colors.muted, marginVertical: 12 }}>MÀU NỀN</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(['light', 'sepia', 'dark'] as const).map((theme, i) => button(['Sáng', 'Giấy vàng', 'Tối'][i],
                () => setSettings(s => ({ ...s, theme })), settings.theme === theme))}
            </View>
            <Text style={{ color: colors.muted, marginVertical: 12 }}>PHÔNG CHỮ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {button('Có chân', () => setSettings(s => ({ ...s, font: 'serif' })), settings.font === 'serif')}
              {button('Không chân', () => setSettings(s => ({ ...s, font: 'sans' })), settings.font === 'sans')}
            </View>
            <Text style={{ color: colors.muted, marginVertical: 12 }}>CỠ CHỮ · {settings.size}</Text>
            <View style={{ flexDirection: 'row' }}>
              {button('A−', () => setSettings(s => ({ ...s, size: Math.max(14, s.size - 2) })), false, settings.size <= 14)}
              {button('A+', () => setSettings(s => ({ ...s, size: Math.min(32, s.size + 2) })), false, settings.size >= 32)}
            </View>
            <Text style={{ color: colors.muted, marginVertical: 12 }}>GIÃN DÒNG</Text>
            <View style={{ flexDirection: 'row' }}>{[1.4, 1.8, 2.2].map(spacing => button(String(spacing),
              () => setSettings(s => ({ ...s, spacing })), settings.spacing === spacing))}</View>
            {storageError && <Text style={{ color: colors.text, marginTop: 12 }}>Không lưu được tùy chỉnh trên thiết bị. Bạn vẫn có thể điều chỉnh cho phiên đọc này.</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
