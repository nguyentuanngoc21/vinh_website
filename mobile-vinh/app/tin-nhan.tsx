import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { mobileApi } from '../src/services/api';
import { ThreadOrders } from '../src/components/OrderSummary';
import { belongsToThread, subscribeMessages } from '../src/services/realtime';
type Conversation = { userId: string; context: string; nickname: string; unreadCount: number; lastMessage: { body: string } };
type Message = { id: string; body: string; createdAt: string; mine: boolean; flagged: boolean };
type Thread = { counterparty: { nickname: string }; messages: Message[]; markReadFailed?: boolean; hasMore?: boolean };
const OLDER_PAGE = 50;
export default function Messages() {
  const { session, loading } = useAuth();
  const params = useLocalSearchParams<{ chat?: string; context?: string }>();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Inbox key={session?.user.id ?? 'guest'} userId={session?.user.id} initialChat={params.chat} initialContext={params.context} />;
}
function Inbox({ userId, initialChat, initialContext }: { userId?: string; initialChat?: string; initialContext?: string }) {
  const [chat, setChat] = useState(initialChat ?? '');
  const [context, setContext] = useState(initialContext === 'moderation' ? 'moderation' : 'personal');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState('');
  const [username, setUsername] = useState('');
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const generation = useRef(0);
  const sendLock = useRef(false);
  const findLock = useRef(false);
  const load = useCallback(() => {
    const request = ++generation.current;
    if (userId) {
      setLoading(true); setError('');
      const task = chat ? mobileApi<Thread>(`messages/${encodeURIComponent(chat)}?context=${context}`, userId).then(data => {
        if (generation.current === request) setThread(data);
      }) : mobileApi<{ conversations: Conversation[] }>('messages', userId).then(data => {
        if (generation.current === request) setConversations(data.conversations);
      });
      task.catch(e => { if (generation.current === request) setError(e instanceof Error ? e.message : 'Không tải được tin nhắn.'); })
        .finally(() => { if (generation.current === request) setLoading(false); });
    }
    return () => { generation.current++; };
  }, [chat, context, userId]);
  useFocusEffect(load);
  // Realtime: latest values through refs so one subscription per signed-in user is enough.
  const live = useRef({ chat, context, load });
  useEffect(() => { live.current = { chat, context, load }; }, [chat, context, load]);
  useEffect(() => {
    if (!userId) return;
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeMessages(userId, row => {
      const { chat: openChat, context: openContext } = live.current;
      if (!openChat) {
        // Inbox list: coalesce bursts into one reload.
        if (listTimer) clearTimeout(listTimer);
        listTimer = setTimeout(() => live.current.load(), 400);
        return;
      }
      if (!belongsToThread(row, userId, openChat, openContext)) return;
      const mine = row.sender_id === userId;
      const message: Message = { id: row.id, body: row.body, createdAt: row.created_at, mine, flagged: mine && row.flagged_off_platform };
      setThread(old => old && !old.messages.some(m => m.id === message.id) ? { ...old, messages: [...old.messages, message] } : old);
      // Mark it read like a normal load: the thread GET marks exactly the rows it returns.
      if (!mine) void mobileApi(`messages/${encodeURIComponent(openChat)}?context=${openContext}&limit=1`, userId).catch(() => undefined);
    });
    return () => { if (listTimer) clearTimeout(listTimer); unsubscribe(); };
  }, [userId]);
  async function loadOlder() {
    const oldest = thread?.messages[0];
    if (!userId || !oldest || loadingOlder) return;
    setLoadingOlder(true); setError('');
    const request = generation.current;
    try {
      const older = await mobileApi<Thread>(`messages/${encodeURIComponent(chat)}?context=${context}&before=${encodeURIComponent(oldest.createdAt)}&limit=${OLDER_PAGE}`, userId);
      if (generation.current !== request) return;
      setThread(old => old ? { ...old, hasMore: older.hasMore,
        messages: [...older.messages.filter(m => !old.messages.some(x => x.id === m.id)), ...old.messages] } : old);
    } catch (e) { if (generation.current === request) setError(e instanceof Error ? e.message : 'Không tải được tin cũ hơn.'); }
    finally { setLoadingOlder(false); }
  }
  function select(id: string, kind = 'personal') {
    generation.current++; setChat(id); setContext(kind); setThread(null); setDraft(''); setError('');
  }
  async function find() {
    if (!userId || findLock.current) return;
    findLock.current = true; setFinding(true); setError('');
    const request = generation.current;
    try {
      const result = await mobileApi<{ person: { id: string } }>(`people?username=${encodeURIComponent(username.trim())}`, userId);
      if (generation.current === request) select(result.person.id);
    } catch (e) { if (generation.current === request) setError(e instanceof Error ? e.message : 'Không tìm được tài khoản.'); }
    finally { findLock.current = false; setFinding(false); }
  }
  async function send() {
    if (!userId || !draft.trim() || sendLock.current) return;
    sendLock.current = true; setSending(true); setError('');
    const request = generation.current;
    try {
      const result = await mobileApi<{ message: Message; context: string }>(`messages/${encodeURIComponent(chat)}`, userId, { body: draft, context });
      if (generation.current !== request) return;
      setDraft('');
      if (result.context !== context) { setThread(null); setContext(result.context); }
      // The realtime insert may have arrived first; keep one copy.
      else setThread(old => old ? { ...old, messages: old.messages.some(m => m.id === result.message.id) ? old.messages : [...old.messages, result.message] } : old);
    } catch (e) { if (generation.current === request) setError((e instanceof Error ? e.message : 'Không gửi được tin.') + ' Hãy làm mới để kiểm tra trước khi gửi lại.'); }
    finally { sendLock.current = false; setSending(false); }
  }
  return <SafeAreaView className="flex-1 bg-cream-card"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View className="p-5">
      <Pressable accessibilityRole="button" disabled={sending} onPress={() => chat ? select('') : router.canGoBack() ? router.back() : router.replace('/')} className="py-3"><Text className="text-brand-ink">← Quay lại</Text></Pressable>
      <Text className="text-2xl font-bold text-brand-ink">{chat ? thread?.counterparty.nickname || 'Hội thoại' : 'Tin nhắn'}</Text>
      {!!userId && !chat && <View className="mt-4">
        <TextInput accessibilityLabel="Tên tài khoản người nhận" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          editable={!finding} maxLength={80} placeholder="@tentaikhoan" className="rounded-xl border border-cream-border p-3 text-brand-ink" />
        <Pressable accessibilityRole="button" disabled={finding || loading || !username.trim()} onPress={() => void find()} className="py-3">
          <Text className="font-bold text-brand-ink">{finding ? 'Đang tìm…' : 'Mở cuộc trò chuyện mới →'}</Text>
        </Pressable>
      </View>}
      {chat && <Text className="mt-2 text-stone">{context === 'moderation' ? 'Hòm thư kiểm duyệt' : 'Hội thoại cá nhân'} · tin mới hiện ngay</Text>}
      {!!userId && <Pressable accessibilityRole="button" disabled={loading || sending} onPress={() => { load(); }} className="py-3"><Text className="text-brand-ink">Làm mới ↻</Text></Pressable>}
      {!!error && <Text accessibilityLiveRegion="polite" className="text-red-700">{error}</Text>}
      {chat && thread?.markReadFailed && <Text className="text-red-700">Chưa đồng bộ được trạng thái đã đọc. Hãy làm mới để thử lại.</Text>}
      {!!userId && !!chat && context === 'personal' && <ThreadOrders key={chat} userId={userId} otherUserId={chat} />}
    </View>
    {!userId ? <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/ca-nhan')} className="p-6"><Text className="text-brand-ink">Đăng nhập để xem tin nhắn →</Text></Pressable>
      : loading ? <ActivityIndicator color="#143b4d" /> : chat ? <>
        <FlatList data={thread?.messages ?? []} keyExtractor={m => m.id} contentContainerStyle={{ padding: 20 }}
          ListHeaderComponent={thread?.hasMore ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={() => void loadOlder()} className="mb-3 min-h-12 items-center justify-center">
            <Text className="text-brand-ink">{loadingOlder ? 'Đang tải…' : '↑ Tải tin cũ hơn'}</Text></Pressable> : null}
          ListEmptyComponent={!error ? <Text className="text-stone">Chưa có tin nhắn.</Text> : null}
          renderItem={({ item }) => <View className={`mb-3 rounded-2xl p-4 ${item.mine ? 'ml-8 bg-brand-ink' : 'mr-8 bg-white'}`}>
            <Text selectable className={item.mine ? 'text-white' : 'text-brand-ink'}>{item.body}</Text>
            {item.flagged && <Text className="mt-2 text-brand-gold">Nội dung có dấu hiệu giao dịch ngoài nền tảng.</Text>}
          </View>} />
        {thread && <View className="p-4"><TextInput accessibilityLabel="Nội dung tin nhắn" value={draft} onChangeText={setDraft} editable={!sending}
          multiline maxLength={4000} placeholder="Nhập tin nhắn…" style={{ maxHeight: 120 }} className="rounded-xl border border-cream-border p-4 text-brand-ink" />
          <Pressable accessibilityRole="button" disabled={sending || !draft.trim()} onPress={() => void send()} className="mt-2 items-center rounded-xl bg-brand-ink p-4"><Text className="text-white">{sending ? 'Đang gửi…' : 'Gửi'}</Text></Pressable>
        </View>}
      </> : <FlatList data={conversations} keyExtractor={c => `${c.userId}:${c.context}`} contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={!error ? <Text className="text-stone">Chưa có hội thoại. Các cuộc trò chuyện trên web sẽ xuất hiện tại đây.</Text> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => select(item.userId, item.context)} className="mb-3 rounded-2xl border border-cream-border p-5">
          <Text className="font-bold text-brand-ink">{item.nickname} · {item.unreadCount} chưa đọc</Text>
          {item.context === 'moderation' && <Text className="mt-2 text-stone">Kiểm duyệt</Text>}
          <Text numberOfLines={2} className="mt-2 text-stone">{item.lastMessage.body}</Text>
        </Pressable>} />}
  </KeyboardAvoidingView></SafeAreaView>;
}
