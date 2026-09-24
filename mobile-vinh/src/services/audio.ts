import { requireSupabase } from './supabase';

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
