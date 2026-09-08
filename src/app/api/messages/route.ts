import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const RECENT_MESSAGE_LIMIT = 300;

/**
 * GET /api/messages — danh sách hội thoại của người dùng hiện tại. Mỗi
 * hội thoại là 1 cặp (counterparty, context) — cùng 1 admin có thể xuất
 * hiện ở 2 dòng riêng biệt nếu vừa có hòm thư "personal" (chat bình
 * thường) vừa có hòm thư "moderation" (tin gỡ chương) với mình, xem
 * migrations/20260908_add_direct_message_context.sql. Danh tính người
 * gửi LUÔN hiển thị thật ở cả 2 hòm thư. Không có bảng "conversations"
 * riêng (xem migrations/20260828_add_direct_messages.sql) nên tự suy ra
 * bằng cách lấy N tin gần nhất rồi group trong JS — cùng tinh thần "join
 * bằng JS" đã dùng ở src/app/author/layout.tsx.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, recipient_id, body, read_at, created_at, context")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGE_LIMIT);
  if (error) {
    console.error("[messages] list failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách hội thoại." }, { status: 500 });
  }

  // rows đã sắp DESC — dòng đầu tiên gặp mỗi (counterpartyId, context)
  // chính là tin gần nhất của hội thoại đó. Key gộp 2 phần bằng "::" —
  // context chỉ có 2 giá trị cố định ('personal'/'moderation'), không
  // chứa "::" nên không lo đụng độ.
  const byThread = new Map<
    string,
    {
      counterpartyId: string;
      context: "personal" | "moderation";
      lastMessage: { body: string; createdAt: string; mine: boolean };
      unreadCount: number;
    }
  >();
  for (const row of rows ?? []) {
    const counterpartyId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    const key = `${counterpartyId}::${row.context}`;
    const unread = row.recipient_id === userId && row.read_at === null;
    const existing = byThread.get(key);
    if (existing) {
      if (unread) existing.unreadCount += 1;
    } else {
      byThread.set(key, {
        counterpartyId,
        context: row.context,
        lastMessage: { body: row.body, createdAt: row.created_at, mine: row.sender_id === userId },
        unreadCount: unread ? 1 : 0,
      });
    }
  }

  const threads = [...byThread.values()];
  if (threads.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const counterpartyIds = [...new Set(threads.map((t) => t.counterpartyId))];
  const { data: profiles, error: profilesError } = await supabase
    .from("author_public_profiles")
    .select("id, nickname, username, avatar_url")
    .in("id", counterpartyIds);
  if (profilesError) {
    console.error("[messages] profiles lookup failed:", profilesError);
    return NextResponse.json({ error: "Không tải được danh sách hội thoại." }, { status: 500 });
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Đối tác nào có ít nhất 1 đơn dịch vụ (bất kỳ trạng thái) với mình —
  // dùng để lọc tab "Giao dịch" ở bong bóng chat header. Không có
  // conversation_id trên orders (xem ghi chú ở api/orders/route.ts) nên
  // suy luôn từ 1 lượt query "mọi đơn của mình" rồi rút counterpartyId
  // trong JS, cùng tinh thần với cách threads được gộp ở trên — tránh
  // N+1 gọi /api/orders?withUserId= cho từng hội thoại.
  const { data: orderRows, error: ordersError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  if (ordersError) {
    // Không chặn cả danh sách hội thoại chỉ vì tab "Giao dịch" lỗi — log
    // rồi coi như không đối tác nào có đơn (tab đó sẽ rỗng thay vì crash).
    console.error("[messages] orders lookup for transaction tab failed:", ordersError);
  }
  const counterpartyIdsWithOrder = new Set(
    (orderRows ?? []).map((o) => (o.buyer_id === userId ? o.seller_id : o.buyer_id))
  );

  const conversations = threads
    .map((t) => {
      const profile = profileById.get(t.counterpartyId);
      // Người kia đã xoá tài khoản (auth.users cascade xoá luôn
      // direct_messages) — về lý thuyết không còn xảy ra vì FK
      // on delete cascade, giữ lại nhánh này chỉ để không crash nếu có
      // lệch dữ liệu.
      if (!profile) return null;
      return {
        userId: t.counterpartyId,
        context: t.context,
        nickname: profile.nickname,
        username: profile.username,
        avatarUrl: profile.avatar_url,
        isModerationThread: t.context === "moderation",
        lastMessage: t.lastMessage,
        unreadCount: t.unreadCount,
        hasOrder: counterpartyIdsWithOrder.has(t.counterpartyId),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    // Tin mới nhất lên đầu — Map giữ thứ tự chèn (đã DESC theo created_at
    // gốc) nhưng .filter()/.map() có thể không bảo toàn nếu duyệt lại từ
    // Set, sort tường minh cho chắc.
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

  return NextResponse.json({ conversations });
}
