import { requireSupabase } from './supabase';
/** Server error with its status and body (e.g. 403 { missingAgreementIds } from the authoring routes). */
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) { super(message); this.status = status; this.data = data; }
}
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
  if (!response.ok) throw new ApiError(result.error || 'Không thể kết nối với máy chủ.', response.status, result ?? {});
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
/** Public reads that also personalise when signed in (home, search, rankings): Bearer only if a session exists. */
export async function readApi<T>(path: string): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Chưa cấu hình máy chủ ứng dụng.');
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${base.replace(/\/$/, '')}/api/mobile/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể kết nối với máy chủ.');
  return result;
}
