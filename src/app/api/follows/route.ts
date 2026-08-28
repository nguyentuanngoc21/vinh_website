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

  const [
    { data: profiles, error: profilesError },
    { data: allFollows, error: allFollowsError },
    { data: bookRows, error: bookError },
    { data: audioRows, error: audioError },
    { data: designRows, error: designError },
  ] = await Promise.all([
    supabase
      .from("author_public_profiles")
      .select("id, nickname, username, avatar_url, creator_tags")
      .in("id", authorIds),
    // Đếm follower thật của từng người trong danh sách — cùng cách
    // "fetch hết rồi group trong JS" đã dùng ở /ket-noi (xem
    // src/app/ket-noi/page.tsx), đơn giản hơn N query count riêng.
    supabase.from("author_follows").select("author_id").in("author_id", authorIds),
    // creator_tags là tự khai báo thủ công, chưa có UI nào set nó (xuất
    // bản sách cũng KHÔNG tự thêm 'author') nên gần như luôn rỗng — chỉ
    // cần biết CÓ/KHÔNG (không cần đếm), suy nhãn thật từ đây, cùng cách
    // connect-directory.tsx đã làm.
    supabase.from("books").select("author_id").in("author_id", authorIds).eq("published", true).is("deleted_at", null),
    supabase.from("public_audio_narrations").select("narrator_id").in("narrator_id", authorIds),
    supabase.from("public_design_items").select("illustrator_id").in("illustrator_id", authorIds),
  ]);
  if (profilesError || allFollowsError || bookError || audioError || designError) {
    console.error(
      "[follows] profiles/counts/content failed:",
      profilesError ?? allFollowsError ?? bookError ?? audioError ?? designError
    );
    return NextResponse.json({ error: "Không tải được danh sách đang theo dõi." }, { status: 500 });
  }

  const followerCountById = new Map<string, number>();
  for (const row of allFollows ?? []) {
    followerCountById.set(row.author_id, (followerCountById.get(row.author_id) ?? 0) + 1);
  }
  const hasBook = new Set((bookRows ?? []).map((b) => b.author_id));
  const hasAudio = new Set((audioRows ?? []).map((a) => a.narrator_id));
  const hasDesign = new Set((designRows ?? []).map((d) => d.illustrator_id));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const CREATOR_TAG_LABELS: Record<string, string> = {
    author: "Tác giả",
    illustrator: "Họa sĩ",
    narrator: "Lồng tiếng",
  };

  // Giữ đúng thứ tự "theo dõi gần đây nhất trước" từ followRows, không
  // phải thứ tự Supabase trả về cho .in() (không đảm bảo).
  const people = authorIds
    .map((id) => {
      const p = profileById.get(id);
      if (!p) return null;
      const declared = p.creator_tags.map((t) => CREATOR_TAG_LABELS[t]);
      const derived: string[] = [];
      if (hasBook.has(id)) derived.push("Tác giả");
      if (hasAudio.has(id)) derived.push("Lồng tiếng");
      if (hasDesign.has(id)) derived.push("Họa sĩ");
      const tags = [...new Set([...declared, ...derived])];
      return {
        userId: p.id,
        nickname: p.nickname,
        username: p.username,
        avatarUrl: p.avatar_url,
        tags: tags.length > 0 ? tags : ["Đọc giả"],
        followerCount: followerCountById.get(id) ?? 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return NextResponse.json({ people });
}
