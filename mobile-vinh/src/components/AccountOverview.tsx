import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AccountProfile, AccountTransaction, getAccountProfile, getRecentTransactions, transactionLabel, transactionStatus } from '../services/account';

export function AccountOverview({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [entries, setEntries] = useState<AccountTransaction[]>([]);
  const [profileError, setProfileError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(() => {
    const request = ++sequence.current;
    setLoading(true); setProfileError(''); setHistoryError('');
    Promise.allSettled([getAccountProfile(userId), getRecentTransactions(userId)]).then(([info, history]) => {
      if (sequence.current !== request) return;
      if (info.status === 'fulfilled') setProfile(info.value);
      else { setProfile(null); setProfileError(info.reason instanceof Error ? info.reason.message : 'Không tải được hồ sơ.'); }
      if (history.status === 'fulfilled') setEntries(history.value);
      else { setEntries([]); setHistoryError(history.reason instanceof Error ? history.reason.message : 'Không tải được lịch sử.'); }
      setLoading(false);
    });
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);
  return <View className="mt-6">
    <View className="mb-4 flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-xl font-bold text-brand-ink">Hồ sơ & ví xu</Text>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => { load(); }} className="p-3">
        <Text className="text-brand-ink">{loading ? 'Đang tải…' : 'Làm mới ↻'}</Text>
      </Pressable>
    </View>
    {loading ? <ActivityIndicator color="#143b4d" /> : <>
      {!!profileError && <Text accessibilityLiveRegion="polite" className="mb-4 text-red-700">{profileError}</Text>}
      {profile && <>
        <Text className="text-xl font-bold text-brand-ink">{profile.nickname || profile.username}</Text>
        <Text className="mb-3 text-sm text-stone">@{profile.username}</Text>
        {!!profile.bio && <Text className="mb-4 leading-6 text-stone">{profile.bio}</Text>}
        <View className="rounded-2xl bg-brand-ink p-5">
          <Text className="mb-2 text-cream">Số dư khả dụng</Text>
          <Text className="mb-4 text-3xl font-bold text-brand-gold">{profile.token_balance.toLocaleString('vi')} xu</Text>
          <Text className="text-cream">Chờ xử lý: {profile.token_balance_pending.toLocaleString('vi')} xu</Text>
          <Text className="mt-3 text-sm leading-6 text-cream">Xu chờ xử lý chưa thể sử dụng. Nạp xu và mua chương trong ứng dụng chưa được hỗ trợ.</Text>
        </View>
      </>}
      <Text accessibilityRole="header" className="mb-2 mt-6 text-lg font-bold text-brand-ink">Giao dịch gần đây</Text>
      <Text className="mb-4 text-sm text-stone">Hiển thị tối đa 20 giao dịch mới nhất.</Text>
      {!!historyError ? <Text accessibilityLiveRegion="polite" className="text-red-700">{historyError}</Text>
        : !entries.length ? <Text className="text-stone">Chưa có giao dịch.</Text> : entries.map(entry => <View key={entry.id} className="mb-3 rounded-xl border border-cream-border p-4">
          <Text className="mb-2 font-bold text-brand-ink">{transactionLabel(entry.type)}</Text>
          <Text className="mb-2 text-lg text-brand-ink">{entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString('vi')} xu</Text>
          <Text className="text-sm leading-6 text-stone">{transactionStatus(entry.status)} · {new Date(entry.created_at).toLocaleString('vi-VN')}</Text>
        </View>)}
    </>}
  </View>;
}
