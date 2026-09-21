import type { SupabaseClient } from "@supabase/supabase-js";
import { ART_STYLE_LABEL } from "@/lib/design/art-styles";
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

// 14 giá trị (4 cũ + 10 mới, additive — xem
// migrations/20260919_add_design_albums_and_multi_upload.sql). 12 mục đầu
// khớp đúng thứ tự cột "Loại sản phẩm" của mega-menu
// (src/components/nav-strip-links.tsx) — nguồn DUY NHẤT cho danh sách này,
// nav-strip-links.tsx import lại từ đây thay vì tự khai báo riêng. 2 mục
// cuối ("Minh họa"/"Poster audio") là 2 giá trị cũ không có mặt trong
// mega-menu, giữ lại để không mất dữ liệu/lựa chọn của các dòng đã đăng
// trước migration này.
export const DESIGN_CATEGORIES: { key: DesignItemCategory; label: string }[] = [
  { key: "bia_truyen", label: "Bìa truyện/sách" },
  { key: "nhan_vat_don", label: "Nhân vật đơn (character art)" },
  { key: "nhan_vat_nhom", label: "Nhân vật nhóm / cảnh nhiều người" },
  { key: "vu_khi_trang_bi", label: "Vũ khí / trang bị" },
  { key: "boi_canh_phong_canh", label: "Bối cảnh / phong cảnh" },
  { key: "linh_vat", label: "Linh vật / thú cưng giả tưởng" },
  { key: "trang_phuc", label: "Trang phục / thiết kế thời trang" },
  { key: "chibi_deform", label: "Chibi / deform" },
  { key: "emote_pack", label: "Biểu tượng cảm xúc (emote pack)" },
  { key: "logo_icon", label: "Logo / huy hiệu / icon" },
  { key: "fan_art", label: "Fanart" },
  { key: "tranh_doi", label: "Tranh đôi / couple art" },
  { key: "minh_hoa", label: "Minh họa" },
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
  // Xem migrations/20260919_add_design_albums_and_multi_upload.sql —
  // album là thực thể lâu dài, hiện luôn ở đây (không chỉ ở form đăng).
  albumId: string | null;
  albumName: string | null;
  artStyleLabel: string | null;
};

export async function getDesignGallery(
  supabase: SupabaseClient<Database>,
  viewerId: string | null,
  // Lọc theo 1 album cụ thể — /thiet-ke?album=<id> (xem
  // src/app/thiet-ke/page.tsx). undefined/null = mọi album + không-album.
  albumId?: string | null
): Promise<GalleryDesignItem[]> {
  let query = supabase
    .from("public_design_items")
    .select("id, illustrator_id, title, image_url, category, description, share_count, created_at, album_id")
    .not("category", "is", null)
    .order("created_at", { ascending: false });
  if (albumId) query = query.eq("album_id", albumId);
  const { data: rows, error } = await query;
  if (error) {
    console.error("[thiet-ke] public_design_items query failed:", error);
  }

  const items = rows ?? [];
  if (items.length === 0) return [];

  const illustratorIds = [...new Set(items.map((i) => i.illustrator_id))];
  const itemIds = items.map((i) => i.id);
  const albumIds = [...new Set(items.map((i) => i.album_id).filter((id): id is string => id != null))];

  const [
    { data: profiles, error: profilesError },
    { data: likeCounts, error: likeCountsError },
    { data: albums, error: albumsError },
  ] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname, avatar_url").in("id", illustratorIds),
    supabase.from("design_item_like_counts").select("design_item_id, like_count").in("design_item_id", itemIds),
    albumIds.length > 0
      ? supabase.from("design_albums").select("id, name, art_style").in("id", albumIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesError) console.error("[thiet-ke] author_public_profiles query failed:", profilesError);
  if (likeCountsError) console.error("[thiet-ke] design_item_like_counts query failed:", likeCountsError);
  if (albumsError) console.error("[thiet-ke] design_albums query failed:", albumsError);
  const albumById = new Map((albums ?? []).map((a) => [a.id, a]));

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

  // Signed URL hết hạn sau 10 phút — thay getPublicUrl() (public, không
  // bao giờ hết hạn) để URL lấy được qua devtools không dùng lại được lâu
  // dài (nhúng sang web khác, gửi cho người khác dùng về sau). KHÔNG chặn
  // được việc tải ảnh ngay lúc đang xem — không có cơ chế frontend nào
  // chặn được điều đó. RLS "design images are publicly readable" (storage
  // policy) đã cho phép SELECT rộng, createSignedUrl(s) dùng được với
  // client cookie-bound thông thường, không cần service-role. 1 lần
  // render đã tải xong ảnh vào <img> thì vẫn hiện đúng dù sau đó hết hạn
  // (trình duyệt không refetch ảnh đã cache) — chỉ ảnh hưởng lần TẢI MỚI.
  const IMAGE_URL_EXPIRY_SECONDS = 600;
  const imagePaths = [...new Set(items.map((i) => i.image_url))];
  const { data: signedUrlRows, error: signError } = imagePaths.length
    ? await supabase.storage.from("design-images").createSignedUrls(imagePaths, IMAGE_URL_EXPIRY_SECONDS)
    : { data: [] as { path: string | null; signedUrl: string | null; error: string | null }[], error: null };
  if (signError) console.error("[thiet-ke] createSignedUrls failed:", signError);
  const signedUrlByPath = new Map<string, string>();
  for (const row of signedUrlRows ?? []) {
    if (row.path && row.signedUrl) signedUrlByPath.set(row.path, row.signedUrl);
    else console.error("[thiet-ke] createSignedUrls: 1 ảnh lỗi ký URL:", row.path, row.error);
  }

  return items.map((item) => {
    const category = item.category as DesignItemCategory;
    const profile = profileById.get(item.illustrator_id);
    const album = item.album_id ? albumById.get(item.album_id) : null;
    // Ký URL lỗi vì BẤT KỲ lý do gì (không nên xảy ra, nhưng đã có lần lỗi
    // thật trên production làm cả gallery mất ảnh) -> rơi về getPublicUrl
    // như trước migration này, KHÔNG BAO GIỜ để <img> vỡ vì thiếu src.
    const imageUrl =
      signedUrlByPath.get(item.image_url) ??
      supabase.storage.from("design-images").getPublicUrl(item.image_url).data.publicUrl;
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? "Khác",
      imageUrl,
      illustratorId: item.illustrator_id,
      illustratorName: profile?.nickname ?? "Ẩn danh",
      illustratorAvatarUrl: profile?.avatar_url ?? null,
      illustratorWorkCount: workCountByIllustrator.get(item.illustrator_id) ?? 1,
      likeCount: likeCountById.get(item.id) ?? 0,
      shareCount: item.share_count,
      likedByViewer: likedSet.has(item.id),
      createdAt: item.created_at,
      albumId: album?.id ?? null,
      albumName: album?.name ?? null,
      artStyleLabel: album ? ART_STYLE_LABEL[album.art_style] ?? null : null,
    };
  });
}
