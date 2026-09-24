import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, AppState, FlatList, Platform, Pressable, Text, View, type ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getProgress, resumeIndex, saveProgress } from '../services/library';
import type { Settings } from '../hooks/useReaderSettings';

type Props = {
  userId?: string; bookId: string; chapterId: string; canSave: boolean;
  paragraphs: string[]; settings: Settings; textColor: string;
  header: ReactElement; footer: ReactElement;
};
const viewabilityConfig = { itemVisiblePercentThreshold: 1, minimumViewTime: 150 };
export function ReaderParagraphs(props: Props) {
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { userId, bookId, chapterId, canSave, paragraphs } = props;
  useEffect(() => {
    let active = true;
    const query = userId && canSave ? getProgress(userId, bookId) : Promise.resolve(null);
    query.then(progress => { if (active) setPosition(resumeIndex(progress, chapterId, paragraphs.length)); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [userId, bookId, chapterId, canSave, paragraphs.length, attempt]);
  if (error) return <View style={{ padding: 24 }}><Text style={{ color: props.textColor }}>{error}</Text>
    <Pressable onPress={() => { setError(''); setAttempt(a => a + 1); }} style={{ padding: 16 }}><Text style={{ color: props.textColor }}>Thử tải vị trí đọc lại</Text></Pressable></View>;
  if (position === null) return <ActivityIndicator color={props.textColor} style={{ flex: 1 }} />;
  return <TrackedParagraphs {...props} initialIndex={position} />;
}

function TrackedParagraphs({ userId, bookId, chapterId, canSave, paragraphs, settings, textColor, header, footer, initialIndex }: Props & { initialIndex: number }) {
  const list = useRef<FlatList<string>>(null);
  const current = useRef<number | null>(null);
  const restored = useRef(initialIndex === 0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<number | null>(null);
  // Completion = the last paragraph was on screen; the saved position stays the first visible one.
  const reachedEnd = useRef(false);
  const completionSent = useRef(false);
  const mounted = useRef(true);
  const restoreAttempts = useRef(0);
  const [message, setMessage] = useState('');
  const [restoreFailed, setRestoreFailed] = useState(false);
  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!userId || !canSave || !restored.current || current.current === null) return;
    const completed = reachedEnd.current && !completionSent.current;
    if (lastSaved.current === current.current && !completed) return;
    const index = current.current;
    try {
      await saveProgress(userId, bookId, chapterId, index, completed);
      lastSaved.current = index;
      if (completed) completionSent.current = true;
      if (mounted.current) setMessage('Đã lưu vị trí đọc');
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : 'Chưa lưu được vị trí đọc.'); }
  }, [userId, bookId, chapterId, canSave]);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') void flush(); });
    return () => {
      mounted.current = false; subscription.remove();
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      void flush();
    };
  }, [flush]));
  const restore = useCallback(() => {
    if (restored.current || !paragraphs.length) return;
    if (++restoreAttempts.current > 25) { setRestoreFailed(true); return; }
    list.current?.scrollToIndex({ index: initialIndex, animated: false, viewPosition: 0 });
  }, [initialIndex, paragraphs.length]);
  const onVisible = useCallback(({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
    if (!mounted.current) return;
    const visible = viewableItems.filter(v => v.isViewable && v.index !== null);
    if (!visible.length) return;
    if (!restored.current) {
      if (!visible.some(v => v.index === initialIndex)) return;
      list.current?.scrollToIndex({ index: initialIndex, animated: false, viewPosition: 0 });
      restored.current = true;
      current.current = initialIndex;
    } else current.current = visible[0].index;
    if (visible.some(v => v.index === paragraphs.length - 1)) reachedEnd.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 1500);
  }, [initialIndex, flush, paragraphs.length]);
  return <View style={{ flex: 1 }}>
    {!!message && <Pressable accessibilityRole="button" accessibilityLabel="Lưu lại vị trí đọc" onPress={() => void flush()} style={{ paddingHorizontal: 24, paddingVertical: 8 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: textColor, fontSize: 12 }}>{message}</Text></Pressable>}
    {restoreFailed && <View style={{ padding: 16 }}><Text style={{ color: textColor }}>Chưa cuộn được đến đoạn đã lưu.</Text>
      <Pressable onPress={() => { restoreAttempts.current = 0; setRestoreFailed(false); restore(); }} style={{ padding: 12 }}><Text style={{ color: textColor }}>Thử khôi phục vị trí</Text></Pressable>
      <Pressable onPress={() => { restored.current = true; current.current = 0; setRestoreFailed(false); list.current?.scrollToOffset({ offset: 0, animated: false }); }} style={{ padding: 12 }}><Text style={{ color: textColor }}>Đọc từ đầu chương</Text></Pressable></View>}
    <FlatList ref={list} data={paragraphs} keyExtractor={(_, index) => String(index)}
      contentContainerStyle={{ padding: 26, maxWidth: 760, width: '100%', alignSelf: 'center' }}
      initialNumToRender={Math.min(initialIndex + 8, 40)} windowSize={7}
      onContentSizeChange={restore} onViewableItemsChanged={onVisible}
      viewabilityConfig={viewabilityConfig}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
        if (restoreTimer.current) clearTimeout(restoreTimer.current);
        restoreTimer.current = setTimeout(restore, 200);
      }}
      ListHeaderComponent={header} ListFooterComponent={footer}
      renderItem={({ item }) => <Text selectable style={{ color: textColor, fontSize: settings.size,
        lineHeight: settings.size * settings.spacing, marginBottom: settings.size,
        fontFamily: settings.font === 'serif' ? Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) : undefined }}>{item}</Text>} />
  </View>;
}
