import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const RECENT_MESSAGE_LIMIT = 300;

/**
 * GET /api/messages — danh sách hội thoại của người dùng hiện tại, mỗi
 * hội thoại = 1 người đã từng nhắn qua lại. Không có bảng "conversations"
 * riêng (xem migrations/20260828_add_direct_messages.sql) nên tự suy ra
 * bằng cách lấy N tin gần nhất rồi group theo người đối thoại trong JS —
 * đơn giản hơn DISTINCT ON/window function, chấp nhận được ở quy mô nền
 * tảng này (300 tin gần nhất gần như chắc chắn phủ hết mọi hội thoại
 * đang hoạt động). Cùng tinh thần "join bằng JS" đã dùng ở
 * src/app/author/layout.tsx.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, recipient_id, body, read_at, created_at")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGE_LIMIT);
  if (error) {
    console.error("[messages] list failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách hội thoại." }, { status: 500 });
  }

  // rows đã sắp DESC — dòng đầu tiên gặp mỗi counterpartyId chính là tin
  // gần nhất của hội thoại đó, nên Map giữ đúng thứ tự "mới nhất trước".
  const byCounterparty = new Map<
    string,
    { lastMessage: { body: string; createdAt: string; mine: boolean }; unreadCount: number }
  >();
  for (const row of rows ?? []) {
    const counterpartyId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    const unread = row.recipient_id === userId && row.read_at === null;
    const existing = byCounterparty.get(counterpartyId);
    if (existing) {
      if (unread) existing.unreadCount += 1;
    } else {
      byCounterparty.set(counterpartyId, {
        lastMessage: { body: row.body, createdAt: row.created_at, mine: row.sender_id === userId },
        unreadCount: unread ? 1 : 0,
      });
    }
  }

  const counterpartyIds = [...byCounterparty.keys()];
  if (counterpartyIds.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("author_public_profiles")
    .select("id, nickname, username, avatar_url")
    .in("id", counterpartyIds);
  if (profilesError) {
    console.error("[messages] profiles lookup failed:", profilesError);
    return NextResponse.json({ error: "Không tải được danh sách hội thoại." }, { status: 500 });
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const conversations = counterpartyIds
    .map((id) => {
      const meta = byCounterparty.get(id)!;
      const profile = profileById.get(id);
      // Người kia đã xoá tài khoản (auth.users cascade xoá luôn
      // direct_messages) — về lý thuyết không còn xảy ra vì FK
      // on delete cascade, giữ lại nhánh này chỉ để không crash nếu có
      // lệch dữ liệu.
      if (!profile) return null;
      return {
        userId: id,
        nickname: profile.nickname,
        username: profile.username,
        avatarUrl: profile.avatar_url,
        lastMessage: meta.lastMessage,
        unreadCount: meta.unreadCount,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return NextResponse.json({ conversations });
}
