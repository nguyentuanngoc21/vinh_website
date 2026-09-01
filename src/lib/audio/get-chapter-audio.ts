import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchNarratorProfiles, toAudioTrack, type AudioTrack } from "@/lib/audio/get-audio-catalog";

/**
 * Real audio linked to 1 chapter via chapter_audio_links (nhiều-nhiều,
 * xem docs/supabase/schema.sql phần 9 + link_audio_to_chapter()). Dùng ở
 * cả 2 phía: /author/[bookId]/[chapterId] (tác giả quản lý — gắn/gỡ) và
 * /read/[bookSlug]/[chapterId] (người đọc — nghe). chapter_audio_links tự
 * nó select công khai được ("audio links are publicly viewable"), nên
 * hàm này chạy được với client cookie-bound thường, không cần service-role.
 */
export async function getChapterAudio(
  supabase: SupabaseClient<Database>,
  chapterId: string
): Promise<AudioTrack[]> {
  const { data: links, error } = await supabase
    .from("chapter_audio_links")
    .select("audio_narration_id, linked_at")
    .eq("chapter_id", chapterId)
    .order("linked_at", { ascending: true });
  if (error) console.error("[audio] chapter_audio_links query failed:", error);

  const ids = (links ?? []).map((l) => l.audio_narration_id);
  if (ids.length === 0) return [];

  const { data: narrationRows, error: narrationError } = await supabase
    .from("public_audio_narrations")
    .select("id, narrator_id, title, audio_url, duration_seconds, genre, play_count, created_at")
    .in("id", ids);
  if (narrationError) console.error("[audio] public_audio_narrations query failed:", narrationError);

  const narrations = narrationRows ?? [];
  const profileById = await fetchNarratorProfiles(supabase, [...new Set(narrations.map((n) => n.narrator_id))]);
  const trackById = new Map(narrations.map((n) => [n.id, toAudioTrack(supabase, n, profileById.get(n.narrator_id))]));

  // Giữ đúng thứ tự gắn trước/sau (linked_at) — bản thu bị xoá sau khi
  // link (hiếm, nhưng có thể) thì lặng lẽ bỏ qua, không hiện track rỗng.
  return ids.map((id) => trackById.get(id)).filter((t): t is AudioTrack => t !== undefined);
}
