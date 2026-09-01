import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DesignItemCategory } from "@/lib/supabase/types";

/**
 * Real, DB-backed gallery data for /thiet-ke (src/components/design/design-gallery.tsx)
 * — replaces the hardcoded DESIGN_PINS mock in src/lib/design-gallery.ts.
 * Reads public_design_items (RLS-transparent view over design_items, see
 * docs/supabase/schema.sql phần 9) joined with design_item_like_counts
 * (migrations/20260901_add_design_item_gallery_metadata.sql) and
 * author_public_profiles for the illustrator's display name/avatar.
 *
 * Only items with a category are shown — book-cover art created through
 * the story_upload flow (src/app/api/authoring/books/[bookId]/cover/route.ts)
 * has no category (illustrators never chose one for it) and stays out of
 * this showcase; it's still visible wherever the book itself is shown via
 * resolveBookCoverUrl(). Everything with a category came either from
 * /thiet-ke/new (independent) or was explicitly categorized.
 */

export const DESIGN_CATEGORIES: { key: DesignItemCategory; label: string }[] = [
  { key: "bia_truyen", label: "Bìa truyện" },
  { key: "minh_hoa", label: "Minh họa" },
  { key: "fan_art", label: "Fan art" },
  { key: "poster_audio", label: "Poster audio" },
];

const CATEGORY_LABEL: Record<DesignItemCategory, string> = Object.fromEntries(
  DESIGN_CATEGORIES.map((c) => [c.key, c.label])
) as Record<DesignItemCategory, string>;

export const DESIGN_SORTS = [
  { key: "likes", label: "Lượt thích" },
  { key: "shares", label: "Chia sẻ" },
  { key: "new", label: "Mới nhất" },
] as const;
export type DesignSortKey = (typeof DESIGN_SORTS)[number]["key"];

export const DESIGN_SORT_DESCRIPTIONS: Record<DesignSortKey, string> = {
  likes: "lượt thích",
  shares: "lượt chia sẻ",
  new: "thời gian đăng",
};

export function formatCount(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}

export type GalleryDesignItem = {
  id: string;
  title: string;
  description: string | null;
  category: DesignItemCategory;
  categoryLabel: string;
  imageUrl: string;
  illustratorId: string;
  illustratorName: string;
  illustratorAvatarUrl: string | null;
  illustratorWorkCount: number;
  likeCount: number;
  shareCount: number;
  likedByViewer: boolean;
  createdAt: string;
};

export async function getDesignGallery(
  supabase: SupabaseClient<Database>,
  viewerId: string | null
): Promise<GalleryDesignItem[]> {
  const { data: rows, error } = await supabase
    .from("public_design_items")
    .select("id, illustrator_id, title, image_url, category, description, share_count, created_at")
    .not("category", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[thiet-ke] public_design_items query failed:", error);
  }

  const items = rows ?? [];
  if (items.length === 0) return [];

  const illustratorIds = [...new Set(items.map((i) => i.illustrator_id))];
  const itemIds = items.map((i) => i.id);

  const [{ data: profiles, error: profilesError }, { data: likeCounts, error: likeCountsError }] =
    await Promise.all([
      supabase.from("author_public_profiles").select("id, nickname, avatar_url").in("id", illustratorIds),
      supabase.from("design_item_like_counts").select("design_item_id, like_count").in("design_item_id", itemIds),
    ]);
  if (profilesError) console.error("[thiet-ke] author_public_profiles query failed:", profilesError);
  if (likeCountsError) console.error("[thiet-ke] design_item_like_counts query failed:", likeCountsError);

  let likedSet = new Set<string>();
  if (viewerId) {
    const { data: viewerLikes, error: viewerLikesError } = await supabase
      .from("design_item_likes")
      .select("design_item_id")
      .eq("user_id", viewerId)
      .in("design_item_id", itemIds);
    if (viewerLikesError) console.error("[thiet-ke] design_item_likes query failed:", viewerLikesError);
    likedSet = new Set((viewerLikes ?? []).map((r) => r.design_item_id));
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const likeCountById = new Map((likeCounts ?? []).map((r) => [r.design_item_id, r.like_count]));
  const workCountByIllustrator = new Map<string, number>();
  for (const item of items) {
    workCountByIllustrator.set(item.illustrator_id, (workCountByIllustrator.get(item.illustrator_id) ?? 0) + 1);
  }

  return items.map((item) => {
    const category = item.category as DesignItemCategory;
    const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(item.image_url);
    const profile = profileById.get(item.illustrator_id);
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? "Khác",
      imageUrl: urlData.publicUrl,
      illustratorId: item.illustrator_id,
      illustratorName: profile?.nickname ?? "Ẩn danh",
      illustratorAvatarUrl: profile?.avatar_url ?? null,
      illustratorWorkCount: workCountByIllustrator.get(item.illustrator_id) ?? 1,
      likeCount: likeCountById.get(item.id) ?? 0,
      shareCount: item.share_count,
      likedByViewer: likedSet.has(item.id),
      createdAt: item.created_at,
    };
  });
}
