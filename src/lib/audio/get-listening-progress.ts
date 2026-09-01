import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchNarratorProfiles, toAudioTrack, type AudioTrack } from "@/lib/audio/get-audio-catalog";

export type ListeningProgressItem = {
  track: AudioTrack;
  positionSeconds: number;
  updatedAt: string;
};

/**
 * Real per-user "đang nghe dở" data for ContinueListening (hero, top row)
 * and ResumeRow ("Nghe tiếp") on /audio — reads audio_progress
 * (migrations/20260901_add_audio_narration_hub_metadata.sql), most
 * recently updated first. Returns [] for a guest or a listener with no
 * progress yet — both sections render nothing in that case (see
 * src/components/audio-hub/continue-listening.tsx/resume-row.tsx),
 * never a fabricated placeholder.
 */
export async function getListeningProgress(
  supabase: SupabaseClient<Database>,
  viewerId: string | null,
  limit: number
): Promise<ListeningProgressItem[]> {
  if (!viewerId) return [];

  const { data: progressRows, error } = await supabase
    .from("audio_progress")
    .select("audio_narration_id, position_seconds, updated_at")
    .eq("user_id", viewerId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) console.error("[audio] audio_progress query failed:", error);

  const rows = progressRows ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.audio_narration_id);
  const { data: narrationRows, error: narrationError } = await supabase
    .from("public_audio_narrations")
    .select("id, narrator_id, title, audio_url, duration_seconds, genre, play_count, created_at")
    .in("id", ids);
  if (narrationError) console.error("[audio] public_audio_narrations query failed:", narrationError);

  const narrations = narrationRows ?? [];
  const profileById = await fetchNarratorProfiles(supabase, [...new Set(narrations.map((n) => n.narrator_id))]);
  const trackById = new Map(narrations.map((n) => [n.id, toAudioTrack(supabase, n, profileById.get(n.narrator_id))]));

  return rows
    .map((r) => {
      const track = trackById.get(r.audio_narration_id);
      // Bản thu đã bị xoá kể từ lần nghe cuối — bỏ qua thay vì hiện link chết.
      if (!track) return null;
      return { track, positionSeconds: r.position_seconds, updatedAt: r.updated_at };
    })
    .filter((x): x is ListeningProgressItem => x !== null);
}
