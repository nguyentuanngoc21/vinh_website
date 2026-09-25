import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Field, Notice, ScreenHeader } from '../src/components/Form';
import { ImageSlot } from '../src/components/ImageSlot';
import { DateField } from '../src/components/DateField';
import { formFile, type PreparedImage } from '../src/services/images';
import {
  fromIsoDate, getBank, getIdentity, getMyProfile, saveBank, submitIdentity, updateMyProfile,
  type Bank, type BankDetails, type IdentityStatus, type MyProfile,
} from '../src/services/profile';

// Mirrors the web's "Thông tin cá nhân": contract details, identity verification and payout bank.
// Each section saves on its own, so a failure in one never discards what was typed in another.
export default function PersonalInfo() {
  const { session, loading } = useAuth();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        <ScreenHeader title="Thông tin cá nhân" onBack={() => router.back()} />
        {session ? <Sections key={session.user.id} userId={session.user.id} />
          : <Text className="leading-7 text-stone">Đăng nhập để cập nhật thông tin cá nhân.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Sections({ userId }: { userId: string }) {
  const [data, setData] = useState<{ profile: MyProfile; identity: IdentityStatus; bank: BankDetails } | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(() => {
    const request = ++sequence.current;
    setError('');
    Promise.all([getMyProfile(userId), getIdentity(userId), getBank(userId)])
      .then(([profile, identity, bank]) => { if (request === sequence.current) setData({ profile, identity, bank }); })
      .catch(e => { if (request === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được thông tin.'); });
    return () => { sequence.current++; };
  }, [userId]);
  useFocusEffect(load);
  if (!data) return error ? <><Notice message={error} /><Button label="Thử lại" secondary onPress={load} /></>
    : <ActivityIndicator color="#143b4d" style={{ marginTop: 32 }} />;
  return <>
    <Text className="mb-6 leading-6 text-stone">Dùng để tự điền các bên trong Cam kết & Thỏa thuận và để nhận thanh toán.
      Thông tin chỉ bạn và Vịnh xem được.</Text>
    <ContractSection userId={userId} profile={data.profile} />
    <IdentitySection userId={userId} status={data.identity} onSaved={identity => setData(d => d && { ...d, identity })} />
    <BankSection userId={userId} details={data.bank} />
  </>;
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return <View className="mb-3 mt-8 border-t border-cream-border pt-6">
    <Text accessibilityRole="header" className="text-lg font-bold text-brand-ink">{title}</Text>
    {!!description && <Text className="mt-1 leading-6 text-stone">{description}</Text>}
  </View>;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await action()); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  return { busy, error, notice, run };
}

function ContractSection({ userId, profile }: { userId: string; profile: MyProfile }) {
  const [saved, setSaved] = useState(profile);
  const [realName, setRealName] = useState(profile.realName);
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? '');
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address);
  const { busy, error, notice, run } = useAction();
  const changed = realName.trim() !== saved.realName || phone.trim() !== saved.phone || address.trim() !== saved.address
    || dateOfBirth !== (saved.dateOfBirth ?? '');
  return <>
    <SectionTitle title="Thông tin hợp đồng" description="Điền đúng như trên giấy tờ tùy thân. Bút danh lấy từ nickname, email lấy từ tài khoản." />
    <Field label="Họ và tên" value={realName} onChangeText={setRealName} editable={!busy} maxLength={100} autoComplete="name" />
    <DateField label="Ngày sinh" value={dateOfBirth} onChange={setDateOfBirth} disabled={busy} optional />
    <Field label="Điện thoại" value={phone} onChangeText={setPhone} editable={!busy} maxLength={20} keyboardType="phone-pad" autoComplete="tel" />
    <Field label="Địa chỉ" value={address} onChangeText={setAddress} editable={!busy} maxLength={300} autoComplete="street-address" multiline />
    <Button label={busy ? 'Đang lưu…' : 'Lưu thông tin hợp đồng'} disabled={busy || !changed}
      onPress={() => void run(async () => {
        const fields = { realName: realName.trim(), phone: phone.trim(), address: address.trim(), dateOfBirth };
        await updateMyProfile(userId, fields);
        setSaved(s => ({ ...s, ...fields, dateOfBirth: fields.dateOfBirth || null }));
        return 'Đã lưu thông tin hợp đồng.';
      })} />
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </>;
}

function IdentitySection({ userId, status, onSaved }: { userId: string; status: IdentityStatus; onSaved: (s: IdentityStatus) => void }) {
  const [editing, setEditing] = useState(!status.cccdVerified);
  const [cccd, setCccd] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [front, setFront] = useState<PreparedImage | null>(null);
  const [back, setBack] = useState<PreparedImage | null>(null);
  const { busy, error, notice, run } = useAction();
  const ready = cccd.length === 12 && !!front && !!back;
  return <>
    <SectionTitle title="Xác minh danh tính" description="Ảnh CCCD được lưu riêng tư, chỉ dùng để xác minh; hồ sơ chỉ hiện 4 số cuối." />
    {status.cccdVerified && <View className="mb-2 rounded-2xl bg-white p-4">
      <Text className="font-bold text-brand-ink">Đã xác minh · {status.cccdNumberMasked}</Text>
      {status.cccdIssuedAt && <Text className="mt-1 text-stone">Ngày cấp: {fromIsoDate(status.cccdIssuedAt)}</Text>}
    </View>}
    {!editing ? <Button label="Cập nhật CCCD mới" secondary onPress={() => setEditing(true)} /> : <>
      <Field label="Số căn cước công dân" value={cccd} onChangeText={v => setCccd(v.replace(/\D/g, '').slice(0, 12))} editable={!busy}
        keyboardType="number-pad" maxLength={12} error={cccd && cccd.length !== 12 ? `Đã nhập ${cccd.length}/12 chữ số` : undefined} />
      <DateField label="Ngày cấp (không bắt buộc)" value={issuedAt} onChange={setIssuedAt} disabled={busy} optional />
      <ImageSlot label="Mặt trước CCCD" image={front} onChange={setFront} disabled={busy} />
      <ImageSlot label="Mặt sau CCCD" image={back} onChange={setBack} disabled={busy} />
      <Button label={busy ? 'Đang kiểm tra ảnh…' : 'Gửi xác minh'} disabled={busy || !ready} onPress={() => void run(async () => {
        if (!front || !back) throw new Error('Cần ảnh cả hai mặt CCCD.');
        const form = new FormData();
        form.append('cccd', cccd);
        if (issuedAt) form.append('cccdIssuedAt', issuedAt);
        form.append('cccdFront', formFile(front));
        form.append('cccdBack', formFile(back));
        const result = await submitIdentity(userId, form);
        onSaved(result);
        setEditing(false); setCccd(''); setIssuedAt(''); setFront(null); setBack(null);
        return 'Đã xác minh CCCD.';
      })} />
      {busy && <Text className="mt-3 text-sm text-stone">Đang đọc số trên ảnh, có thể mất đến một phút.</Text>}
      {status.cccdVerified && <Button label="Hủy" secondary disabled={busy} onPress={() => { setEditing(false); setCccd(''); setIssuedAt(''); setFront(null); setBack(null); }} />}
    </>}
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </>;
}

function BankSection({ userId, details }: { userId: string; details: BankDetails }) {
  const [bankCode, setBankCode] = useState(details.bankCode ?? '');
  const [accountNumber, setAccountNumber] = useState(details.bankAccountNumber ?? '');
  const [accountName, setAccountName] = useState(details.bankAccountName ?? '');
  const [picking, setPicking] = useState(false);
  const { busy, error, notice, run } = useAction();
  const bank = details.banks.find(b => b.code === bankCode);
  const numberOk = /^\d{6,19}$/.test(accountNumber);
  const ready = !!bank && numberOk && !!accountName.trim() && accountName.trim().length <= 100;
  return <>
    <SectionTitle title="Tài khoản ngân hàng" description="Dùng khi rút xu hoặc nhận thanh toán. Bạn chịu trách nhiệm về tính chính xác của thông tin này." />
    <Text className="mb-2 text-brand-ink">Ngân hàng</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Chọn ngân hàng" disabled={busy} onPress={() => setPicking(true)}
      className="mb-4 min-h-12 justify-center rounded-xl border border-cream-border bg-white px-4 py-4">
      <Text className={bank ? 'text-base text-brand-ink' : 'text-base text-stone'}>{bank ? `${bank.shortName} — ${bank.name}` : 'Chọn ngân hàng'}</Text>
    </Pressable>
    <Field label="Số tài khoản" value={accountNumber} onChangeText={v => setAccountNumber(v.replace(/\D/g, '').slice(0, 19))} editable={!busy}
      keyboardType="number-pad" maxLength={19} error={accountNumber && !numberOk ? 'Số tài khoản gồm 6–19 chữ số.' : undefined} />
    <Field label="Tên chủ tài khoản" value={accountName} onChangeText={setAccountName} editable={!busy} maxLength={100} autoCapitalize="characters"
      hint="Ghi đúng như ngân hàng in, thường là chữ in hoa không dấu." />
    <Button label={busy ? 'Đang lưu…' : 'Lưu tài khoản ngân hàng'} disabled={busy || !ready} onPress={() => void run(async () => {
      await saveBank(userId, { bankCode, bankAccountNumber: accountNumber, bankAccountName: accountName.trim() });
      return 'Đã lưu tài khoản ngân hàng.';
    })} />
    <Notice message={error} />
    <Notice message={notice} tone="success" />
    <BankPicker visible={picking} banks={details.banks} onClose={() => setPicking(false)} onPick={code => { setBankCode(code); setPicking(false); }} />
  </>;
}

function BankPicker({ visible, banks, onPick, onClose }: { visible: boolean; banks: Bank[]; onPick: (code: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? banks.filter(b => `${b.shortName} ${b.name} ${b.code}`.toLowerCase().includes(q)) : banks;
  }, [banks, query]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-cream-card">
      <View className="px-5 pb-3">
        <Text accessibilityRole="header" className="mb-3 text-xl font-bold text-brand-ink">Chọn ngân hàng</Text>
        <TextInput accessibilityLabel="Tìm ngân hàng" value={query} onChangeText={setQuery} placeholder="Tìm theo tên, vd: Vietcombank"
          placeholderTextColor="#8a8178" autoCorrect={false} className="rounded-xl border border-cream-border bg-white px-4 py-4 text-base text-brand-ink" />
      </View>
      <FlatList data={filtered} keyExtractor={b => b.code} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }}
        ListEmptyComponent={<Text className="py-6 text-stone">Không tìm thấy ngân hàng.</Text>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onPick(item.code)} className="min-h-12 border-b border-cream-border py-3">
          <Text className="font-bold text-brand-ink">{item.shortName}</Text>
          <Text className="text-sm text-stone">{item.name}</Text>
        </Pressable>} />
      <View className="px-5 pb-4"><Button label="Đóng" secondary onPress={onClose} /></View>
    </SafeAreaView>
  </Modal>;
}
