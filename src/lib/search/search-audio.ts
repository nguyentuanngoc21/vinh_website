import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AudioSearchResult = {
  id: string;
  title: string;
  narratorNickname: string | null;
  durationSeconds: number | null;
};

const SEARCH_LIMIT = 24;
const AUDIO_SEARCH_COLUMNS = "id, title, narrator_id, duration_seconds, play_count";

type AudioSearchRow = {
  id: string;
  title: string;
  narrator_id: string;
  duration_seconds: number | null;
  play_count: number;
};

/** Tìm bản thu audio theo tên hoặc tên người đọc — cùng cách với
 * searchBooks (ilike, 2 truy vấn rồi gộp ở JS, xem comment ở đó). Query
 * qua view public_audio_narrations (không phải bảng gốc audio_narrations)
 * — bảng gốc chỉ cho narrator sở hữu SELECT (RLS), giống lý do
 * resolve-book-cover.ts dùng public_design_items thay vì design_items. */
export async function searchAudio(supabase: SupabaseClient<Database>, query: string): Promise<AudioSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const likeQ = `%${q}%`;

  const [byTitle, matchingNarrators] = await Promise.all([
    supabase
      .from("public_audio_narrations")
      .select(AUDIO_SEARCH_COLUMNS)
      .ilike("title", likeQ)
      .order("play_count", { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase.from("author_public_profiles").select("id, nickname").ilike("nickname", likeQ),
  ]);

  const narratorIds = (matchingNarrators.data ?? []).map((a) => a.id);
  const byNarrator = narratorIds.length
    ? await supabase
        .from("public_audio_narrations")
        .select(AUDIO_SEARCH_COLUMNS)
        .in("narrator_id", narratorIds)
        .limit(SEARCH_LIMIT)
    : { data: [] as AudioSearchRow[] };

  const merged = new Map<string, AudioSearchRow>();
  for (const row of [...(byTitle.data ?? []), ...(byNarrator.data ?? [])]) merged.set(row.id, row);
  const rows = [...merged.values()].slice(0, SEARCH_LIMIT);
  if (rows.length === 0) return [];

  const nicknameIds = [...new Set(rows.map((r) => r.narrator_id))];
  const { data: narrators } = await supabase.from("author_public_profiles").select("id, nickname").in("id", nicknameIds);
  const nicknameById = new Map((narrators ?? []).map((a) => [a.id, a.nickname]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    narratorNickname: nicknameById.get(r.narrator_id) ?? null,
    durationSeconds: r.duration_seconds,
  }));
}
