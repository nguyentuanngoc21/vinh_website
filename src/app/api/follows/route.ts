import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * GET /api/follows — danh sách người mà user hiện tại đang theo dõi,
 * dùng cho tab "Đang theo dõi" (following-tab.tsx). Trước đây là
 * FOLLOWED_PEOPLE mock ở src/lib/profile.ts.
 *
 * author_follows RLS chỉ cho follower tự SELECT hàng của mình (đủ cho
 * bước 1 — "tôi theo dõi ai"), nhưng đếm follower của TỪNG người trong
 * danh sách đó (bước 2) cần thấy hàng của người khác nên phải qua
 * service-role, giống GET /api/profile/me.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: followRows, error: followError } = await supabase
    .from("author_follows")
    .select("author_id")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });
  if (followError) {
    console.error("[follows] list failed:", followError);
    return NextResponse.json({ error: "Không tải được danh sách đang theo dõi." }, { status: 500 });
  }

  const authorIds = (followRows ?? []).map((r) => r.author_id);
  if (authorIds.length === 0) {
    return NextResponse.json({ people: [] });
  }

  const [{ data: profiles, error: profilesError }, { data: allFollows, error: allFollowsError }] =
    await Promise.all([
      supabase
        .from("author_public_profiles")
        .select("id, nickname, username, avatar_url, creator_tags")
        .in("id", authorIds),
      // Đếm follower thật của từng người trong danh sách — cùng cách
      // "fetch hết rồi group trong JS" đã dùng ở /ket-noi (xem
      // src/app/ket-noi/page.tsx), đơn giản hơn N query count riêng.
      supabase.from("author_follows").select("author_id").in("author_id", authorIds),
    ]);
  if (profilesError || allFollowsError) {
    console.error("[follows] profiles/counts failed:", profilesError ?? allFollowsError);
    return NextResponse.json({ error: "Không tải được danh sách đang theo dõi." }, { status: 500 });
  }

  const followerCountById = new Map<string, number>();
  for (const row of allFollows ?? []) {
    followerCountById.set(row.author_id, (followerCountById.get(row.author_id) ?? 0) + 1);
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Giữ đúng thứ tự "theo dõi gần đây nhất trước" từ followRows, không
  // phải thứ tự Supabase trả về cho .in() (không đảm bảo).
  const people = authorIds
    .map((id) => {
      const p = profileById.get(id);
      if (!p) return null;
      return {
        userId: p.id,
        nickname: p.nickname,
        username: p.username,
        avatarUrl: p.avatar_url,
        creatorTags: p.creator_tags,
        followerCount: followerCountById.get(id) ?? 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return NextResponse.json({ people });
}
