import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";

/**
 * Real, DB-backed catalog for /audio (LibraryGrid, NarratorsRow) —
 * replaces the hardcoded CATALOG/NARRATORS mock in
 * src/lib/audio-catalog.ts. Reads public_audio_narrations (RLS-transparent
 * view over audio_narrations, now carrying genre/play_count — see
 * migrations/archive/20260901_add_audio_narration_hub_metadata.sql) joined with
 * author_public_profiles for the narrator's display name/avatar.
 *
 * getAudioCatalog() itself only lists what /audio/new (independent
 * uploads) produces — every track here is a narrator's standalone
 * recording, browsable on its own. chapter_audio_links (linking a
 * recording to a specific book chapter) is now wired too, just not
 * through this function: see src/lib/audio/get-chapter-audio.ts (real
 * per-chapter audio, used by /author/[bookId]/[chapterId] to
 * link/record/unlink and by /read/[bookSlug]/[chapterId] to play it) and
 * src/components/author/chapter-audio-panel.tsx (the "Tự thu & gắn"/"Dán
 * link" UI over link_audio_to_chapter(), docs/supabase/schema.sql phần 9).
 */

export const AUDIO_GENRES: BookGenre[] = [
  "Linh dị",
  "Cổ tích & Thần thoại",
  "Dã sử",
  "Trinh thám",
  "Tâm lý - tội phạm",
  "Tình cảm",
  "Đời sống - Xã hội",
  "Khoa học viễn tưởng",
  "Tiên hiệp/ kiếm hiệp",
  "Kỳ ảo",
];

export type AudioTrack = {
  id: string;
  title: string;
  narratorId: string;
  narratorName: string;
  narratorAvatarUrl: string | null;
  genre: BookGenre | null;
  durationSeconds: number | null;
  playCount: number;
  audioUrl: string;
  createdAt: string;
};

export type NarratorStat = {
  narratorId: string;
  name: string;
  avatarUrl: string | null;
  trackCount: number;
  playCount: number;
};

export function formatDurationShort(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}g ${String(m).padStart(2, "0")}p`;
  return `${m} phút`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatPlayCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

type NarrationRow = {
  id: string;
  narrator_id: string;
  title: string;
  audio_url: string;
  duration_seconds: number | null;
  genre: string | null;
  play_count: number;
  created_at: string;
};
type NarratorProfile = { id: string; nickname: string; avatar_url: string | null };

/** Dùng chung bởi getAudioCatalog() và getListeningProgress()
 * (src/lib/audio/get-listening-progress.ts) — cả 2 đều cần join
 * public_audio_narrations với author_public_profiles rồi dựng public URL,
 * chỉ khác tập hàng nguồn. */
export function toAudioTrack(
  supabase: SupabaseClient<Database>,
  row: NarrationRow,
  profile: NarratorProfile | undefined
): AudioTrack {
  const { data: urlData } = supabase.storage.from("audio-narrations").getPublicUrl(row.audio_url);
  return {
    id: row.id,
    title: row.title,
    narratorId: row.narrator_id,
    narratorName: profile?.nickname ?? "Ẩn danh",
    narratorAvatarUrl: profile?.avatar_url ?? null,
    genre: row.genre as BookGenre | null,
    durationSeconds: row.duration_seconds,
    playCount: row.play_count,
    audioUrl: urlData.publicUrl,
    createdAt: row.created_at,
  };
}

export async function fetchNarratorProfiles(
  supabase: SupabaseClient<Database>,
  narratorIds: string[]
): Promise<Map<string, NarratorProfile>> {
  if (narratorIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("author_public_profiles")
    .select("id, nickname, avatar_url")
    .in("id", narratorIds);
  if (error) console.error("[audio] author_public_profiles query failed:", error);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/**
 * Id audio đã gắn vào chương của truyện 18+ (view adult_audio_narration_ids,
 * migrations/20261002_book_age_ratings.sql) — mọi danh sách audio CÔNG KHAI
 * (thư viện, nổi bật, tìm kiếm, Kết nối) phải lọc bỏ. Người đã xác thực tuổi
 * vẫn nghe trong trang đọc chương. Trả về hàm kiểm tra; lỗi truy vấn → coi
 * MỌI audio là 18+ (danh sách tạm rỗng) — không lộ audio 18+ chỉ vì lọc hỏng,
 * nhưng cũng không làm sập trang chủ / /audio.
 */
export async function fetchAdultAudioIds(supabase: SupabaseClient<Database>): Promise<{ has: (id: string) => boolean }> {
  const { data, error } = await supabase.from("adult_audio_narration_ids").select("audio_narration_id");
  if (error) {
    console.error("[audio] adult_audio_narration_ids query failed:", error);
    return { has: () => true };
  }
  return new Set((data ?? []).map((r) => r.audio_narration_id));
}

export async function getAudioCatalog(supabase: SupabaseClient<Database>): Promise<AudioTrack[]> {
  const [{ data: rows, error }, adultIds] = await Promise.all([
    supabase
      .from("public_audio_narrations")
      .select("id, narrator_id, title, audio_url, duration_seconds, genre, play_count, created_at")
      .order("created_at", { ascending: false }),
    fetchAdultAudioIds(supabase),
  ]);
  if (error) {
    console.error("[audio] public_audio_narrations query failed:", error);
  }

  const tracks = (rows ?? []).filter((t) => !adultIds.has(t.id));
  if (tracks.length === 0) return [];

  const profileById = await fetchNarratorProfiles(supabase, [...new Set(tracks.map((t) => t.narrator_id))]);

  return tracks.map((t) => toAudioTrack(supabase, t, profileById.get(t.narrator_id)));
}

/** Bài nghe nhiều nhất (AudioSpotlight trang chủ) — 1 hàng thay vì tải cả
 * kho như getAudioCatalog(). Hoà play_count thì bài mới hơn thắng, giống
 * cách trang chủ từng sort lại danh sách (vốn đã DESC theo created_at). */
export async function getTopAudioTrack(supabase: SupabaseClient<Database>): Promise<AudioTrack | null> {
  // Lấy vài bài đầu rồi bỏ audio 18+ — không lọc được bằng 1 câu PostgREST.
  const [{ data: rows, error }, adultIds] = await Promise.all([
    supabase
      .from("public_audio_narrations")
      .select("id, narrator_id, title, audio_url, duration_seconds, genre, play_count, created_at")
      .order("play_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
    fetchAdultAudioIds(supabase),
  ]);
  if (error) console.error("[audio] top track query failed:", error);
  const row = (rows ?? []).find((r) => !adultIds.has(r.id));
  if (!row) return null;

  const profileById = await fetchNarratorProfiles(supabase, [row.narrator_id]);
  return toAudioTrack(supabase, row, profileById.get(row.narrator_id));
}

const NARRATOR_STATS_LIMIT = 5;

export function getNarratorStats(tracks: AudioTrack[]): NarratorStat[] {
  const byNarrator = new Map<string, NarratorStat>();
  for (const t of tracks) {
    const cur = byNarrator.get(t.narratorId) ?? {
      narratorId: t.narratorId,
      name: t.narratorName,
      avatarUrl: t.narratorAvatarUrl,
      trackCount: 0,
      playCount: 0,
    };
    cur.trackCount += 1;
    cur.playCount += t.playCount;
    byNarrator.set(t.narratorId, cur);
  }
  return [...byNarrator.values()].sort((a, b) => b.playCount - a.playCount).slice(0, NARRATOR_STATS_LIMIT);
}
