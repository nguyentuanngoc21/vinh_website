import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Notice, ScreenHeader } from '../src/components/Form';
import { getAchievements, groupByRole, ROLE_LABELS, type Achievement, type RoleKey } from '../src/services/quests';

export default function Achievements() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  if (!session) return <SafeAreaView className="flex-1 bg-cream-card p-6">
    <ScreenHeader title="Thành tựu" onBack={() => router.back()} />
    <Text className="mb-2 leading-7 text-stone">Đăng nhập để xem thành tựu của bạn.</Text>
    <Button label="Đăng nhập" onPress={() => router.push('/(tabs)/ca-nhan')} />
  </SafeAreaView>;
  return <Board key={session.user.id} userId={session.user.id} />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function Board({ userId }: { userId: string }) {
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [open, setOpen] = useState<RoleKey | null>('reader');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (pull = false) => {
    const request = ++sequence.current;
    if (pull) setRefreshing(true);
    setError('');
    try { const next = await getAchievements(userId); if (request === sequence.current) setItems(next); }
    catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được thành tựu.'); }
    finally { if (request === sequence.current) setRefreshing(false); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const groups = items ? groupByRole(items) : [];
  const unlocked = items?.filter(a => a.unlocked).length ?? 0;
  return <SafeAreaView className="flex-1 bg-cream-card">
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#143b4d" />}>
      <ScreenHeader title="Thành tựu" onBack={() => router.back()} />
      {!items && !error && <ActivityIndicator color="#143b4d" style={{ marginTop: 32 }} />}
      {items && <Text className="mb-5 leading-6 text-stone">Đã đạt {unlocked}/{items.length} thành tựu. Thưởng xu được cộng tự động khi đạt.</Text>}
      {items && !items.length && <Text className="text-stone">Chưa có thành tựu nào.</Text>}
      {groups.map(({ role, items: list }) => {
        const done = list.filter(a => a.unlocked).length;
        const expanded = open === role;
        return <View key={role} className="mb-3 overflow-hidden rounded-2xl border border-cream-border bg-white">
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : role)}
            className="min-h-12 flex-row items-center justify-between p-4">
            <View className="flex-1">
              <Text className="text-lg font-bold text-brand-ink">{ROLE_LABELS[role]}</Text>
              <Text className="text-stone">{done}/{list.length} thành tựu</Text>
            </View>
            <Text className="text-xl text-brand-ink">{expanded ? '−' : '+'}</Text>
          </Pressable>
          {expanded && list.map(item => <AchievementRow key={item.id} item={item} />)}
        </View>;
      })}
      <Notice message={error} />
      {!!error && !items && <Button label="Thử lại" secondary onPress={() => void load()} />}
    </ScrollView>
  </SafeAreaView>;
}

function AchievementRow({ item }: { item: Achievement }) {
  const target = item.progress?.target ?? 0;
  const current = Math.min(item.progress?.current ?? 0, target);
  return <View className={`border-t border-cream-border p-4 ${item.unlocked ? 'bg-white' : 'bg-cream-card'}`}>
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text className={`font-bold ${item.unlocked ? 'text-brand-ink' : 'text-stone'}`}>{item.unlocked ? '✓ ' : ''}{item.title}</Text>
        {!!item.description && <Text className="mt-1 leading-6 text-stone">{item.description}</Text>}
      </View>
      {item.rewardTokens > 0 && <Text className="font-bold text-brand-ink">+{item.rewardTokens} xu</Text>}
    </View>
    {item.unlocked ? !!item.unlockedAt && <Text className="mt-2 text-sm text-stone">Đạt ngày {formatDate(item.unlockedAt)}</Text>
      : target > 0 && <>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: target, now: current }} className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
          <View className="h-2 rounded-full bg-brand-gold" style={{ width: `${Math.round((current / target) * 100)}%` }} />
        </View>
        <Text className="mt-1 text-sm text-stone">{current}/{target}</Text>
      </>}
  </View>;
}
