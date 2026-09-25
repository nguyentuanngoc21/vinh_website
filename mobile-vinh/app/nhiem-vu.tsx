import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Notice, ScreenHeader } from '../src/components/Form';
import { getMyProfile } from '../src/services/profile';
import { claimQuest, getQuestPool, questTypeLabel, resetQuest, type QuestPool, type QuestSlot } from '../src/services/quests';

export default function Quests() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Nhiệm vụ" onBack={() => router.back()} />
    <Text className="mb-2 leading-7 text-stone">Đăng nhập để nhận nhiệm vụ hằng ngày và thưởng xu.</Text>
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <QuestBoard key={session.user.id} userId={session.user.id} />;
}

function QuestBoard({ userId }: { userId: string }) {
  const [pool, setPool] = useState<QuestPool | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (pull = false) => {
    const request = ++sequence.current;
    if (pull) setRefreshing(true);
    setError('');
    try {
      // The streak is best-effort: a failed profile read must not hide today's quests.
      const [nextPool, profile] = await Promise.all([getQuestPool(userId), getMyProfile(userId).catch(() => null)]);
      if (request !== sequence.current) return;
      setPool(nextPool);
      if (profile) setStreak(profile.currentQuestStreak ?? 0);
    } catch (e) {
      if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được nhiệm vụ hôm nay.');
    } finally { if (request === sequence.current) setRefreshing(false); }
  }, [userId]);
  // Reload on focus so progress made while reading shows up when coming back.
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));

  async function act(id: string, action: () => Promise<unknown>, success: string) {
    if (pending) return;
    setPending(id); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { setPending(''); }
  }
  const resetsLeft = pool ? Math.max(0, pool.maxResetsPerDay - pool.resetsUsedToday) : 0;
  function confirmReset(slot: QuestSlot) {
    Alert.alert('Đổi nhiệm vụ này?', `Vịnh sẽ chọn một nhiệm vụ khác cùng loại. Còn ${resetsLeft}/${pool?.maxResetsPerDay ?? 0} lượt đổi hôm nay.`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đổi', onPress: () => void act(slot.taskTemplateId, () => resetQuest(userId, slot.taskTemplateId), 'Đã đổi nhiệm vụ.') },
    ]);
  }

  const slots = pool?.slots ?? [];
  const done = slots.filter(s => s.completed).length;
  const remainingReward = slots.filter(s => !s.completed).reduce((sum, s) => sum + s.rewardTokens, 0);
  return <SafeAreaView className="flex-1 bg-cream-card">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}>
      <ScreenHeader title="Nhiệm vụ" onBack={() => router.back()} />
      {!pool && !error && <ActivityIndicator color="#143b4d" style={{ marginTop: 32 }} />}
      {pool && <View className="mb-5 rounded-2xl border border-cream-border bg-white p-5">
        <Text className="text-lg font-bold text-brand-ink">Nhiệm vụ hôm nay</Text>
        <Text className="mt-1 text-stone">Hoàn thành {done}/{slots.length} · Còn {remainingReward} xu có thể nhận</Text>
        <Text className="mt-1 text-sm text-stone">Còn {resetsLeft}/{pool.maxResetsPerDay} lượt đổi nhiệm vụ hôm nay</Text>
        {streak !== null && <Text className="mt-3 font-bold text-brand-ink">🔥 Chuỗi đọc {streak} ngày</Text>}
        <Text className="mt-1 text-sm leading-5 text-stone">Đọc hết một chương mỗi ngày để giữ chuỗi. Mốc chuỗi được thưởng tự động và hiện trong Thành tựu.</Text>
      </View>}
      {pool && !slots.length && <Text className="leading-6 text-stone">Chưa có nhiệm vụ nào hôm nay — quay lại sau nhé.</Text>}
      {slots.map(slot => <QuestCard key={slot.taskTemplateId} slot={slot} pending={pending} canReset={resetsLeft > 0}
        onClaim={() => void act(slot.userDailyTaskId, () => claimQuest(userId, slot.userDailyTaskId), `Đã nhận ${slot.rewardTokens} xu.`)}
        onReset={() => confirmReset(slot)} />)}
      <Notice message={error} />
      <Notice message={notice} tone="success" />
      {!!error && !pool && <Button label="Thử lại" secondary onPress={() => void load()} />}
      <Button label="Xem Thành tựu →" secondary onPress={() => router.push('/thanh-tuu')} />
    </ScrollView>
  </SafeAreaView>;
}

function QuestCard({ slot, pending, canReset, onClaim, onReset }: {
  slot: QuestSlot; pending: string; canReset: boolean; onClaim: () => void; onReset: () => void;
}) {
  const fraction = slot.targetCount > 0 ? Math.min(1, slot.progress / slot.targetCount) : 0;
  const busy = !!pending;
  const claiming = pending === slot.userDailyTaskId;
  const resetting = pending === slot.taskTemplateId;
  return <View className={`mb-3 rounded-2xl border border-cream-border p-4 ${slot.completed && !slot.claimed ? 'bg-cream' : 'bg-white'}`}>
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text className="text-xs tracking-widest text-stone">{questTypeLabel(slot.questType).toUpperCase()}</Text>
        <Text className="mt-1 text-base font-bold text-brand-ink">{slot.title}</Text>
        {!!slot.description && <Text className="mt-1 leading-6 text-stone">{slot.description}</Text>}
      </View>
      <Text className="font-bold text-brand-ink">+{slot.rewardTokens} xu</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: slot.targetCount, now: Math.min(slot.progress, slot.targetCount) }}
      className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
      <View className="h-2 rounded-full bg-brand-gold" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </View>
    <Text className="mt-1 text-sm text-stone">{Math.min(slot.progress, slot.targetCount)}/{slot.targetCount}</Text>
    <View className="mt-2 flex-row flex-wrap gap-3">
      {slot.claimed ? <Text className="min-h-12 py-3 font-bold text-brand-ink">✓ Đã nhận thưởng</Text>
        : slot.completed ? <Pressable accessibilityRole="button" disabled={busy} onPress={onClaim} style={{ opacity: busy ? 0.5 : 1 }}
          className="min-h-12 justify-center rounded-xl bg-brand-ink px-5"><Text className="font-bold text-white">{claiming ? 'Đang nhận…' : `Nhận ${slot.rewardTokens} xu`}</Text></Pressable>
          : canReset && <Pressable accessibilityRole="button" accessibilityLabel={`Đổi nhiệm vụ ${slot.title}`} disabled={busy} onPress={onReset}
            style={{ opacity: busy ? 0.5 : 1 }} className="min-h-12 justify-center rounded-xl border border-brand-ink px-5">
            <Text className="text-brand-ink">{resetting ? 'Đang đổi…' : '↻ Đổi nhiệm vụ'}</Text></Pressable>}
    </View>
  </View>;
}
