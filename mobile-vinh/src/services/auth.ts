import { requireSupabase } from './supabase';

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vui lòng nhập email hợp lệ.');
  return email;
}
function authMessage(code?: string) {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Bạn đã thử quá nhiều lần. Vui lòng chờ một lát rồi thử lại.';
  if (code === 'email_not_confirmed') return 'Email chưa được xác nhận. Hãy xác nhận tài khoản trên web trước khi đăng nhập.';
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
