import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ReadingSource } from '@/lib/supabase/types';
import { checkChapterAccess } from '@/lib/reading/chapter-access';

type Client = SupabaseClient<Database>;
export type HeartbeatInput = { chapterId: string; sessionId: string | null; paragraphIndex: number; source: ReadingSource | null };
export type HeartbeatResult =
  | { ok: true; sessionId: string; activeSeconds: number }
  | { ok: false; status: 400 | 403 | 404 | 502; error: string };

export const READING_SOURCES: readonly ReadingSource[] = ['contest', 'trending', 'search', 'profile', 'recommendation', 'other'];

export function parseReadingSource(value: unknown): ReadingSource | null {
  return typeof value === 'string' && (READING_SOURCES as readonly string[]).includes(value) ? (value as ReadingSource) : null;
}

/**
 * Ghi 1 nhịp đọc (Contest Engine Phase 2, P1) — đường ghi duy nhất của reading_sessions.
 * Kiểm quyền đọc như recordReadingProgress() (chương xuất bản, chưa gỡ; chương trả phí phải
 * là tác giả hoặc đã mua) rồi gọi record_reading_heartbeat(): server cộng khoảng thời gian
 * THẬT giữa 2 nhịp (≤ 90 giây), không tin số client gửi. `client` là service-role client.
 * Xem migrations/20260926_add_reading_session_tracking.sql.
 */
export async function recordReadingHeartbeat(client: Client, userId: string, input: HeartbeatInput): Promise<HeartbeatResult> {
  const access = await checkChapterAccess(client, userId, input.chapterId);
  if (!access.ok) return access;
  const paragraphCount = access.chapter.content ? access.chapter.content.split('\n\n').length : 0;
  if (input.paragraphIndex >= Math.max(1, paragraphCount)) return { ok: false, status: 400, error: 'Vị trí đọc không hợp lệ.' };

  const { data, error } = await client.rpc('record_reading_heartbeat', {
    p_user_id: userId,
    p_session_id: input.sessionId,
    p_chapter_id: input.chapterId,
    p_paragraph: input.paragraphIndex,
    p_source: input.source,
  });
  const row = data?.[0];
  if (error || !row) {
    console.error('[reading-heartbeat] failed:', error?.message ?? 'no row');
    return { ok: false, status: 502, error: 'Không ghi được phiên đọc.' };
  }
  return { ok: true, sessionId: row.session_id, activeSeconds: row.active_seconds };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Đọc body chung cho route web + mobile; null = body không hợp lệ. */
export function parseHeartbeatBody(body: unknown): HeartbeatInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const chapterId = typeof b.chapterId === 'string' ? b.chapterId : '';
  const sessionId = b.sessionId === undefined || b.sessionId === null ? null : typeof b.sessionId === 'string' ? b.sessionId : '';
  const paragraphIndex = b.paragraphIndex;
  if (!UUID.test(chapterId) || (sessionId !== null && !UUID.test(sessionId))) return null;
  if (typeof paragraphIndex !== 'number' || !Number.isInteger(paragraphIndex) || paragraphIndex < 0) return null;
  return { chapterId, sessionId, paragraphIndex, source: parseReadingSource(b.source) };
}
