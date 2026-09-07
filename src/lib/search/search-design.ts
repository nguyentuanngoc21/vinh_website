import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DesignItemCategory } from "@/lib/supabase/types";

export type DesignSearchResult = {
  id: string;
  title: string;
  category: DesignItemCategory | null;
  illustratorNickname: string | null;
  imageUrl: string;
};

const SEARCH_LIMIT = 24;
const DESIGN_SEARCH_COLUMNS = "id, title, category, illustrator_id, image_url, share_count";

type DesignSearchRow = {
  id: string;
  title: string;
  category: DesignItemCategory | null;
  illustrator_id: string;
  image_url: string;
  share_count: number;
};

/** Tìm ảnh Thiết kế theo tên hoặc tên hoạ sĩ — cùng cách với
 * searchBooks/searchAudio (ilike, 2 truy vấn rồi gộp ở JS). Query qua
 * view public_design_items, không phải bảng gốc (xem
 * resolve-book-cover.ts). */
export async function searchDesign(supabase: SupabaseClient<Database>, query: string): Promise<DesignSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const likeQ = `%${q}%`;

  const [byTitle, matchingIllustrators] = await Promise.all([
    supabase
      .from("public_design_items")
      .select(DESIGN_SEARCH_COLUMNS)
      .ilike("title", likeQ)
      .order("share_count", { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase.from("author_public_profiles").select("id, nickname").ilike("nickname", likeQ),
  ]);

  const illustratorIds = (matchingIllustrators.data ?? []).map((a) => a.id);
  const byIllustrator = illustratorIds.length
    ? await supabase
        .from("public_design_items")
        .select(DESIGN_SEARCH_COLUMNS)
        .in("illustrator_id", illustratorIds)
        .limit(SEARCH_LIMIT)
    : { data: [] as DesignSearchRow[] };

  const merged = new Map<string, DesignSearchRow>();
  for (const row of [...(byTitle.data ?? []), ...(byIllustrator.data ?? [])]) merged.set(row.id, row);
  const rows = [...merged.values()].slice(0, SEARCH_LIMIT);
  if (rows.length === 0) return [];

  const nicknameIds = [...new Set(rows.map((r) => r.illustrator_id))];
  const { data: illustrators } = await supabase
    .from("author_public_profiles")
    .select("id, nickname")
    .in("id", nicknameIds);
  const nicknameById = new Map((illustrators ?? []).map((a) => [a.id, a.nickname]));

  const bucket = supabase.storage.from("design-images");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    illustratorNickname: nicknameById.get(r.illustrator_id) ?? null,
    imageUrl: bucket.getPublicUrl(r.image_url).data.publicUrl,
  }));
}
