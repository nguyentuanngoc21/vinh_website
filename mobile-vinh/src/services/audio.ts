import { requireSupabase } from './supabase';
import { mobileApi } from './api';

export type AudioTrack = {
  id: string; title: string; narratorName: string; genre: string | null;
  durationSeconds: number | null; playCount: number; audioUrl: string;
};

export async function getAudioCatalog(): Promise<AudioTrack[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('public_audio_narrations')
    .select('id,narrator_id,title,audio_url,duration_seconds,genre,play_count,created_at')
    .order('created_at', { ascending: false }).limit(100).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được danh sách audio. Vui lòng kiểm tra kết nối và thử lại.');
  if (!data.length) return [];
  const ids = [...new Set(data.map(t => t.narrator_id))];
  const profiles = await client.from('author_public_profiles').select('id,nickname').in('id', ids)
    .abortSignal(AbortSignal.timeout(15000));
  if (profiles.error) throw new Error('Không tải được thông tin người kể chuyện. Vui lòng thử lại.');
  return data.map(t => ({ id: t.id, title: t.title,
    narratorName: profiles.data.find(p => p.id === t.narrator_id)?.nickname || 'Ẩn danh',
    genre: t.genre, durationSeconds: t.duration_seconds, playCount: t.play_count,
    audioUrl: client.storage.from('audio-narrations').getPublicUrl(t.audio_url).data.publicUrl,
  }));
}

export function formatAudioTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

export type ListeningProgress = { audioId: string; positionSeconds: number; updatedAt: string };
async function listenerClient(userId: string) {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error('Phiên đăng nhập đã thay đổi.');
  return client;
}
/** Saved positions, newest first — the same audio_progress rows the web player writes (RLS: own rows only). */
export async function getListeningProgress(userId: string): Promise<ListeningProgress[]> {
  const client = await listenerClient(userId);
  const { data, error } = await client.from('audio_progress').select('audio_narration_id,position_seconds,updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không tải được vị trí nghe đã lưu.');
  return (data ?? []).map(r => ({ audioId: r.audio_narration_id, positionSeconds: r.position_seconds, updatedAt: r.updated_at }));
}
/** Same upsert as the web's POST /api/audio/progress (whole seconds, updated_at set explicitly). */
export async function saveListeningProgress(userId: string, audioId: string, positionSeconds: number) {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;
  const client = await listenerClient(userId);
  const { error } = await client.from('audio_progress').upsert({
    user_id: userId, audio_narration_id: audioId, position_seconds: Math.floor(positionSeconds), updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,audio_narration_id' }).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error('Không lưu được vị trí nghe.');
}
/** Play count via the web's POST /api/audio/[id]/play (no sign-in needed); callers send it once per track per session. */
export async function recordPlay(audioId: string) {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) return;
  await fetch(`${base.replace(/\/$/, '')}/api/audio/${encodeURIComponent(audioId)}/play`, { method: 'POST', signal: AbortSignal.timeout(15000) }).catch(() => undefined);
}

export type AudioComment = {
  id: string; content: string; parentCommentId: string | null; createdAt: string; authorId: string;
  authorName?: string; authorAvatarUrl?: string | null; isOwn: boolean; likeCount: number; liked: boolean;
};
export function getAudioComments(userId: string, audioId: string) {
  return mobileApi<{ comments: AudioComment[] }>(`audio/${encodeURIComponent(audioId)}/comments`, userId).then(r => r.comments);
}
export function audioCommentAction<T = unknown>(userId: string, audioId: string, action: 'comment' | 'delete' | 'like', fields: Record<string, unknown> = {}) {
  return mobileApi<T>(`audio/${encodeURIComponent(audioId)}/comments`, userId, { action, ...fields });
}
