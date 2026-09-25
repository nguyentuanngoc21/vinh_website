import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Field, Notice, ScreenHeader } from '../src/components/Form';
import { normalizeEmail, passwordProblem, sendPasswordResetCode, setNewPassword, verifyPasswordResetCode } from '../src/services/auth';

type Step = 'email' | 'code' | 'password' | 'done';

// OTP-code only, never email links (docs/SUPABASE_SETUP.md §5): the code works on any device.
// Verifying the code signs the user in with a recovery session; the new password is then set on it.
export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { if (alive.current) setBusy(false); }
  }
  const send = (target: string) => run(async () => {
    await sendPasswordResetCode(target);
    setSentTo(target); setRetryAt(Date.now() + 60000); setNow(Date.now()); setStep('code');
    setNotice('Nếu email này có tài khoản Vịnh, mã đặt lại mật khẩu đã được gửi. Kiểm tra cả thư rác.');
  });
  const pwProblem = password || confirm ? passwordProblem(password, confirm) : '';

  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        <ScreenHeader title="Quên mật khẩu" onBack={() => router.back()} />
        {step === 'email' && <>
          <Text className="mb-4 leading-7 text-stone">Nhập email tài khoản Vịnh. Chúng tôi sẽ gửi mã để bạn đặt mật khẩu mới.</Text>
          <Field label="Email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none"
            autoComplete="email" textContentType="emailAddress" placeholder="ban@example.com" />
          <Button label="Gửi mã" disabled={busy || !email.trim()} onPress={() => void (async () => {
            try { await send(normalizeEmail(email)); } catch (e) { setError(e instanceof Error ? e.message : 'Email không hợp lệ.'); }
          })()} />
        </>}
        {step === 'code' && <>
          <Field label="Mã xác nhận" value={token} onChangeText={v => setToken(v.replace(/\D/g, '').slice(0, 10))} editable={!busy}
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="Nhập mã trong email" />
          <Button label="Tiếp tục" disabled={busy || token.length < 6}
            onPress={() => void run(async () => { await verifyPasswordResetCode(sentTo, token); setStep('password'); })} />
          <Button label={wait ? `Gửi lại mã sau ${wait}s` : 'Gửi lại mã'} secondary disabled={busy || wait > 0} onPress={() => void send(sentTo)} />
          <Button label="Đổi email" secondary disabled={busy} onPress={() => { setStep('email'); setToken(''); setNotice(''); }} />
        </>}
        {step === 'password' && <>
          <Text className="mb-4 leading-7 text-stone">Mã hợp lệ. Đặt mật khẩu mới cho {sentTo}.</Text>
          <Field label="Mật khẩu mới" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none"
            autoComplete="new-password" textContentType="newPassword" hint="Ít nhất 8 ký tự." />
          <Field label="Nhập lại mật khẩu mới" value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry autoCapitalize="none"
            autoComplete="new-password" textContentType="newPassword" error={confirm ? pwProblem || undefined : undefined} />
          <Button label={busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'} disabled={busy || !password || !!pwProblem}
            onPress={() => void run(async () => { await setNewPassword(password, confirm); setStep('done'); })} />
        </>}
        {step === 'done' && <>
          <Text className="mb-4 leading-7 text-brand-ink">Đã đổi mật khẩu. Bạn đang đăng nhập trên thiết bị này; lần sau hãy dùng mật khẩu mới.</Text>
          <Button label="Về trang Cá nhân" onPress={() => router.replace('/(tabs)/ca-nhan')} />
        </>}
        <Notice message={error} />
        <Notice message={notice} tone="success" />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
