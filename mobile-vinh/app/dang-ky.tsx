import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';
import { Button, Check, Field, Notice, ScreenHeader } from '../src/components/Form';
import { ImageSlot } from '../src/components/ImageSlot';
import { LegalModal, type PublicDocId } from '../src/components/LegalModal';
import { formFile, type PreparedImage } from '../src/services/images';
import { isAvailable, normalizeEmail, passwordProblem, registerAccount, resendSignupCode, verifySignupCode } from '../src/services/auth';

type Availability = { value: string; available: boolean | null };

export default function Register() {
  const { session, loading } = useAuth();
  const [sentTo, setSentTo] = useState('');
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#143b4d" />;
  // After OTP confirmation Supabase signs the user in; send them to their account tab.
  if (session) return <Redirect href="/(tabs)/ca-nhan" />;
  return <SafeAreaView className="flex-1 bg-cream-card">
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
        {/* The account already exists once the code is sent, so going back leaves the flow instead of re-showing the form. */}
        <ScreenHeader title={sentTo ? 'Xác nhận email' : 'Tạo tài khoản'} onBack={() => router.back()} />
        {sentTo ? <ConfirmCode email={sentTo} /> : <RegisterForm onRegistered={setSentTo} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function RegisterForm({ onRegistered }: { onRegistered: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [realname, setRealname] = useState('');
  const [phone, setPhone] = useState('');
  const [cccd, setCccd] = useState('');
  const [front, setFront] = useState<PreparedImage | null>(null);
  const [back, setBack] = useState<PreparedImage | null>(null);
  const [agree, setAgree] = useState(false);
  const [legal, setLegal] = useState<PublicDocId | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<Availability | null>(null);
  const [emailCheck, setEmailCheck] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const uname = username.trim();
  const cccdDigits = cccd.replace(/\D/g, '');
  // Identity verification is optional (same as web), but must be complete once started.
  const cccdStarted = cccd.length > 0 || !!front || !!back;
  const cccdComplete = cccdDigits.length === 12 && !!front && !!back;
  const usernameTaken = usernameCheck?.value === uname && usernameCheck.available === false;
  const emailTaken = emailCheck?.value === email.trim() && emailCheck.available === false;
  const pwProblem = password || confirm ? passwordProblem(password, confirm) : '';
  const missing = [
    !email.trim() && 'email', !uname && 'tên tài khoản', !nickname.trim() && 'nickname', !password && 'mật khẩu',
    !!pwProblem && 'mật khẩu hợp lệ', usernameTaken && 'tên tài khoản khác', emailTaken && 'email khác',
    cccdStarted && cccdDigits.length !== 12 && 'CCCD đủ 12 số', cccdStarted && (!front || !back) && 'ảnh cả hai mặt CCCD',
    !agree && 'đồng ý điều khoản',
  ].filter(Boolean) as string[];

  async function check(field: 'username' | 'email', value: string, set: (v: Availability) => void) {
    const trimmed = value.trim();
    if (!trimmed) return;
    set({ value: trimmed, available: null });
    // Availability is a convenience only; the server checks again on submit.
    try { set({ value: trimmed, available: await isAvailable(field, trimmed) }); } catch { set({ value: trimmed, available: null }); }
  }

  async function submit() {
    if (busy || missing.length) return;
    setBusy(true); setError('');
    try {
      const target = normalizeEmail(email);
      const form = new FormData();
      form.append('email', target);
      form.append('username', uname);
      form.append('nickname', nickname.trim());
      form.append('password', password);
      if (realname.trim()) form.append('realname', realname.trim());
      if (phone.trim()) form.append('phone', phone.trim());
      if (cccdComplete && front && back) {
        form.append('cccd', cccdDigits);
        form.append('cccdFront', formFile(front));
        form.append('cccdBack', formFile(back));
      }
      await registerAccount(form);
      onRegistered(target);
    } catch (e) { setError(e instanceof Error ? e.message : 'Đăng ký thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }

  return <>
    <Field label="Email" value={email} onChangeText={setEmail} onBlur={() => void check('email', email, setEmailCheck)} editable={!busy}
      keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="ban@example.com"
      error={emailTaken ? 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng Quên mật khẩu.' : undefined} />
    <Field label="Tên tài khoản" value={username} onChangeText={setUsername} onBlur={() => void check('username', username, setUsernameCheck)}
      editable={!busy} autoCapitalize="none" autoComplete="username-new" placeholder="vd: ngocnguyen"
      hint={uname ? `Địa chỉ trang cá nhân: vinh.vn/@${uname.toLowerCase().replace(/\s+/g, '')}` : undefined}
      error={usernameTaken ? 'Tên tài khoản đã được sử dụng.' : undefined} />
    <Field label="Nickname (tên hiển thị)" value={nickname} onChangeText={setNickname} editable={!busy} maxLength={40} autoComplete="nickname" />
    <Field label="Mật khẩu" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none"
      autoComplete="new-password" textContentType="newPassword" hint="Ít nhất 8 ký tự." />
    <Field label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry autoCapitalize="none"
      autoComplete="new-password" textContentType="newPassword" error={confirm ? pwProblem || undefined : undefined} />

    <Text className="mb-1 mt-4 text-lg font-bold text-brand-ink">Xác minh danh tính</Text>
    <Text className="mb-4 leading-6 text-stone">Tùy chọn — có thể bổ sung sau trong Hồ sơ. Nếu nhập CCCD, cần đủ số và ảnh hai mặt;
      ảnh được lưu riêng tư, chỉ dùng để xác minh.</Text>
    <Field label="Họ và tên thật" value={realname} onChangeText={setRealname} editable={!busy} maxLength={100} autoComplete="name" />
    <Field label="Số điện thoại" value={phone} onChangeText={setPhone} editable={!busy} maxLength={20} keyboardType="phone-pad" autoComplete="tel" />
    <Field label="Số căn cước công dân" value={cccd} onChangeText={v => setCccd(v.replace(/\D/g, '').slice(0, 12))} editable={!busy}
      keyboardType="number-pad" maxLength={12} error={cccd && cccdDigits.length !== 12 ? `Đã nhập ${cccdDigits.length}/12 chữ số` : undefined} />
    <ImageSlot label="Mặt trước CCCD" image={front} onChange={setFront} disabled={busy} />
    <ImageSlot label="Mặt sau CCCD" image={back} onChange={setBack} disabled={busy} />

    <Check checked={agree} onToggle={() => setAgree(v => !v)}>
      <Text className="leading-6 text-brand-ink">Tôi xác nhận thông tin trên là chính xác và đồng ý với Điều khoản sử dụng cùng Chính sách bảo mật của Vịnh.</Text>
    </Check>
    <Button label="Đọc Điều khoản sử dụng" secondary onPress={() => setLegal('dieu-khoan-su-dung')} />
    <Button label="Đọc Chính sách bảo mật" secondary onPress={() => setLegal('chinh-sach-bao-mat')} />

    {!!missing.length && <Text className="mt-5 leading-6 text-stone">Cần hoàn thiện: {missing.join(', ')}.</Text>}
    <Button label={busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'} onPress={() => void submit()} disabled={busy || !!missing.length} />
    {busy && cccdComplete && <Text className="mt-3 text-sm text-stone">Đang kiểm tra ảnh CCCD, có thể mất đến một phút.</Text>}
    <Notice message={error} />
    <Button label="Đã có tài khoản? Đăng nhập" secondary onPress={() => router.back()} disabled={busy} />
    <LegalModal docId={legal} onClose={() => setLegal(null)} />
  </>;
}

function ConfirmCode({ email }: { email: string }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryAt, setRetryAt] = useState(() => Date.now() + 60000);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <>
    <Text className="mb-4 leading-7 text-stone">Vịnh đã gửi mã xác nhận đến {email}. Nhập mã trong email để hoàn tất đăng ký. Kiểm tra cả thư rác.</Text>
    <Field label="Mã xác nhận" value={token} onChangeText={v => setToken(v.replace(/\D/g, '').slice(0, 10))} editable={!busy}
      keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="Nhập mã trong email" />
    <Button label={busy ? 'Đang xác nhận…' : 'Xác nhận'} disabled={busy || token.length < 6} onPress={() => void run(() => verifySignupCode(email, token))} />
    <Button label={wait ? `Gửi lại mã sau ${wait}s` : 'Gửi lại mã'} secondary disabled={busy || wait > 0}
      onPress={() => void run(async () => { await resendSignupCode(email); setRetryAt(Date.now() + 60000); setNotice('Đã gửi lại mã xác nhận.'); })} />
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </>;
}
