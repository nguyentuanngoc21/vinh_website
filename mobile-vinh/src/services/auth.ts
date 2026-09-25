import { requireSupabase } from './supabase';
import { publicApi } from './api';

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vui lòng nhập email hợp lệ.');
  return email;
}
function authMessage(code?: string) {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Bạn đã thử quá nhiều lần. Vui lòng chờ một lát rồi thử lại.';
  if (code === 'email_not_confirmed') return 'Email chưa được xác nhận. Hãy nhập mã trong email xác nhận đăng ký, hoặc đăng ký lại để nhận mã mới.';
  return 'Không thể đăng nhập. Kiểm tra thông tin và kết nối mạng rồi thử lại.';
}
export async function loginWithPassword(email: string, password: string) {
  if (!password) throw new Error('Vui lòng nhập mật khẩu.');
  const { error } = await requireSupabase().auth.signInWithPassword({ email: normalizeEmail(email), password });
  if (error) throw new Error(error.code === 'invalid_credentials' ? 'Email hoặc mật khẩu không đúng.' : authMessage(error.code));
}
export async function sendLoginCode(email: string) {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email: normalizeEmail(email), options: { shouldCreateUser: false },
  });
  if (error) throw new Error(authMessage(error.code));
}
export async function verifyLoginCode(email: string, token: string) {
  if (!/^\d{6,10}$/.test(token.trim())) throw new Error('Vui lòng nhập đầy đủ mã số trong email.');
  const { error } = await requireSupabase().auth.verifyOtp({ email: normalizeEmail(email), token: token.trim(), type: 'email' });
  if (error) throw new Error(error.code === 'otp_expired' ? 'Mã không đúng hoặc đã hết hạn. Hãy nhập lại hoặc gửi mã mới.' : authMessage(error.code));
}

const codePattern = /^\d{6,10}$/;
const codeError = 'Mã không đúng hoặc đã hết hạn. Hãy nhập lại hoặc gửi mã mới.';

// Registration runs on the backend (profile row, optional CCCD OCR, private upload); the app then
// confirms with the email OTP directly against Supabase Auth, like the web's /api/auth/verify-otp.
export async function registerAccount(form: FormData) {
  await publicApi<{ pendingConfirmation: true }>('auth/register', form);
}
export async function isAvailable(field: 'username' | 'email', value: string) {
  const query = `field=${field}&value=${encodeURIComponent(value.trim())}`;
  const result = await publicApi<{ available: boolean }>(`auth/check-availability?${query}`);
  return result.available;
}
export async function verifySignupCode(email: string, token: string) {
  if (!codePattern.test(token.trim())) throw new Error('Vui lòng nhập đầy đủ mã số trong email.');
  const { error } = await requireSupabase().auth.verifyOtp({ email: normalizeEmail(email), token: token.trim(), type: 'signup' });
  if (error) throw new Error(error.code === 'otp_expired' ? codeError : authMessage(error.code));
}
export async function resendSignupCode(email: string) {
  const { error } = await requireSupabase().auth.resend({ type: 'signup', email: normalizeEmail(email) });
  if (error) throw new Error(authMessage(error.code));
}
// Same generic outcome whether or not the email exists, to avoid account enumeration.
export async function sendPasswordResetCode(email: string) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(normalizeEmail(email));
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) throw new Error(authMessage(error.code));
}
export async function verifyPasswordResetCode(email: string, token: string) {
  if (!codePattern.test(token.trim())) throw new Error('Vui lòng nhập đầy đủ mã số trong email.');
  const { error } = await requireSupabase().auth.verifyOtp({ email: normalizeEmail(email), token: token.trim(), type: 'recovery' });
  if (error) throw new Error(error.code === 'otp_expired' ? codeError : authMessage(error.code));
}
export function passwordProblem(password: string, confirm: string) {
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (password !== confirm) return 'Mật khẩu nhập lại chưa khớp.';
  return '';
}
export async function setNewPassword(password: string, confirm: string) {
  const problem = passwordProblem(password, confirm);
  if (problem) throw new Error(problem);
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw new Error(error.code === 'same_password' ? 'Mật khẩu mới phải khác mật khẩu cũ.'
    : error.code === 'weak_password' ? 'Mật khẩu quá yếu. Hãy dùng mật khẩu dài hơn, có chữ và số.'
      : 'Chưa đặt được mật khẩu mới. Hãy yêu cầu mã mới rồi thử lại.');
}
