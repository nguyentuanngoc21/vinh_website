import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/providers/AuthProvider';
import { AccountOverview } from '../../src/components/AccountOverview';
import { router } from 'expo-router';
import { requireSupabase } from '../../src/services/supabase';
import { loginWithPassword, normalizeEmail, sendLoginCode, verifyLoginCode } from '../../src/services/auth';

export default function Profile() {
  const { session, loading, error } = useAuth();
  if (loading) return <SafeAreaView className="flex-1 items-center justify-center bg-cream-card"><ActivityIndicator color="#143b4d" /></SafeAreaView>;
  return <Account key={session?.user.id ?? 'guest'} userId={session?.user.id} email={session?.user.email} signedIn={!!session} restoreError={error} />;
}

function Account({ email: accountEmail, userId, signedIn, restoreError }: { email?: string; userId?: string; signedIn: boolean; restoreError: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [sentTo, setSentTo] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function send() {
    if (Date.now() < retryAt) return;
    const target = normalizeEmail(sentTo || email);
    await sendLoginCode(target);
    if (alive.current) { setSentTo(target); setToken(''); setNow(Date.now()); setRetryAt(Date.now() + 60000); }
  }
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 28, paddingBottom: 48, flexGrow: 1, justifyContent: 'center' }}>
        <Text className="mb-4 text-sm tracking-widest text-stone">VỊNH · CÁ NHÂN</Text>
        <Text className="mb-4 text-3xl font-bold text-brand-ink">{signedIn ? 'Chào mừng bạn trở lại' : 'Đăng nhập vào Vịnh'}</Text>
        {signedIn ? <>
          <Text className="mb-3 text-base text-brand-ink">{accountEmail}</Text>
          <Text className="text-base leading-7 text-stone">Bạn có thể tiếp tục đọc trọn vẹn các chương miễn phí và những chương đã mua trên cùng tài khoản.</Text>
          <ActionButton label="Sửa hồ sơ →" onPress={() => router.push('/ho-so')} secondary />
          <ActionButton label="Thông tin cá nhân →" onPress={() => router.push('/thong-tin-ca-nhan')} secondary />
          <ActionButton label="Thông báo →" onPress={() => router.push('/thong-bao')} secondary />
          <ActionButton label="Tin nhắn →" onPress={() => router.push('/tin-nhan')} secondary />
          <ActionButton label="Cam kết & Thỏa thuận →" onPress={() => router.push('/cam-ket')} secondary />
          <ActionButton label="Dịch vụ của tôi →" onPress={() => router.push('/dich-vu')} secondary />
          {userId && <AccountOverview key={userId} userId={userId} />}
          <ActionButton label="Đăng xuất trên thiết bị này" disabled={busy} secondary onPress={() => void perform(async () => {
            const { error } = await requireSupabase().auth.signOut({ scope: 'local' });
            if (error) throw new Error('Chưa đăng xuất được. Vui lòng thử lại.');
          })} />
        </> : <>
          <Text className="mb-6 text-base leading-7 text-stone">Dùng email tài khoản Vịnh — tài khoản trên web và app là một.</Text>
          <View className="mb-6 flex-row gap-3">
            {(['password', 'otp'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} disabled={busy}
              onPress={() => { setMode(value); setError(''); setPassword(''); setToken(''); }}
              className={`flex-1 items-center rounded-xl border border-cream-border p-4 ${mode === value ? 'bg-brand-ink' : 'bg-cream-card'}`}>
              <Text className={mode === value ? 'text-white' : 'text-brand-ink'}>{value === 'password' ? 'Mật khẩu' : 'Mã OTP'}</Text>
            </Pressable>)}
          </View>
          <Text className="mb-2 text-brand-ink">Email</Text>
          <TextInput accessibilityLabel="Email đăng nhập" value={mode === 'otp' && sentTo ? sentTo : email} onChangeText={setEmail}
            editable={!busy && !(mode === 'otp' && !!sentTo)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            autoComplete="email" placeholder="ban@example.com" placeholderTextColor="#8a8178"
            className="mb-4 rounded-xl border border-cream-border bg-white px-4 py-4 text-base text-brand-ink" />
          {mode === 'password' ? <>
            <Text className="mb-2 text-brand-ink">Mật khẩu</Text>
            <TextInput accessibilityLabel="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry editable={!busy}
              autoCapitalize="none" autoCorrect={false} autoComplete="current-password" returnKeyType="go"
              onSubmitEditing={() => void perform(() => loginWithPassword(email, password))}
              className="rounded-xl border border-cream-border bg-white px-4 py-4 text-base text-brand-ink" />
            <ActionButton label="Đăng nhập" onPress={() => void perform(() => loginWithPassword(email, password))} disabled={busy || !email.trim() || !password} />
          </> : sentTo ? <>
            <Text className="mb-4 leading-6 text-stone">Nếu email thuộc tài khoản đã đăng ký, mã đăng nhập sẽ được gửi đến hộp thư của bạn. Kiểm tra cả thư rác.</Text>
            <TextInput accessibilityLabel="Mã OTP" value={token} onChangeText={v => setToken(v.replace(/\D/g, ''))} keyboardType="number-pad"
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} editable={!busy} placeholder="Nhập mã trong email" placeholderTextColor="#8a8178"
              className="rounded-xl border border-cream-border bg-white px-4 py-4 text-xl text-brand-ink" />
            <ActionButton label="Xác nhận đăng nhập" onPress={() => void perform(() => verifyLoginCode(sentTo, token))} disabled={busy || token.length < 6} />
            <ActionButton label={wait ? `Gửi lại sau ${wait}s` : 'Gửi lại mã'} onPress={() => void perform(send)} disabled={busy || wait > 0} secondary />
            <ActionButton label="Đổi email" onPress={() => { setSentTo(''); setToken(''); setError(''); }} disabled={busy} secondary />
          </> : <ActionButton label={wait ? `Gửi mã sau ${wait}s` : 'Gửi mã đăng nhập'} onPress={() => void perform(send)} disabled={busy || !email.trim() || wait > 0} />}
          {mode === 'password' && <ActionButton label="Quên mật khẩu?" onPress={() => router.push('/quen-mat-khau')} disabled={busy} secondary />}
          <Text className="mt-6 text-sm leading-6 text-stone">Chưa có tài khoản?</Text>
          <ActionButton label="Tạo tài khoản mới" onPress={() => router.push('/dang-ky')} disabled={busy} secondary />
        </>}
        {busy && <ActivityIndicator color="#143b4d" style={{ marginTop: 20 }} />}
        {!!(error || restoreError) && <Text accessibilityLiveRegion="polite" className="mt-5 rounded-xl bg-white p-4 leading-6 text-red-700">{error || restoreError}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function ActionButton({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{ opacity: disabled ? 0.5 : 1 }}
    className={`mt-4 min-h-12 items-center justify-center rounded-2xl border border-brand-ink px-5 py-4 ${secondary ? 'bg-cream-card' : 'bg-brand-ink'}`}>
    <Text className={`text-base font-bold ${secondary ? 'text-brand-ink' : 'text-white'}`}>{label}</Text>
  </Pressable>;
}
