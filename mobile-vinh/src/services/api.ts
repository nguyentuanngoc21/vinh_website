import { requireSupabase } from './supabase';
export async function mobileApi<T>(path: string, userId: string, body?: unknown, options: { timeoutMs?: number } = {}): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Chưa cấu hình máy chủ ứng dụng.');
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi.');
  const multipart = body instanceof FormData;
  const response = await fetch(`${base.replace(/\/$/, '')}/api/mobile/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
    body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? (multipart ? 120000 : 15000)),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể kết nối với máy chủ.');
  const current = await client.auth.getSession();
  if (current.error || current.data.session?.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi.');
  return result;
}
/** For routes used before sign-in (registration, public legal documents): no Authorization header. */
export async function publicApi<T>(path: string, body?: FormData): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Chưa cấu hình máy chủ ứng dụng.');
  const response = await fetch(`${base.replace(/\/$/, '')}/api/mobile/${path}`, {
    method: body ? 'POST' : 'GET', body, signal: AbortSignal.timeout(body ? 120000 : 15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể kết nối với máy chủ.');
  return result;
}
