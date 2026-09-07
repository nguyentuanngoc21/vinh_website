import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { isLikelyOffPlatform } from "@/lib/orders/off-platform-detector";

const THREAD_MESSAGE_LIMIT = 200;
const BODY_MAX = 4000;
type MessageContext = "personal" | "moderation";

function resolveContext(value: unknown): MessageContext {
  return value === "moderation" ? "moderation" : "personal";
}

/**
 * GET /api/messages/:userId?context=personal|moderation — toàn bộ tin
 * nhắn giữa mình và :userId TRONG ĐÚNG 1 hòm thư (context) — cùng 1 cặp
 * người dùng giờ có thể có 2 hòm thư tách biệt: "personal" (chat bình
 * thường) và "moderation" (tin gỡ chương từ tài khoản is_system, xem
 * migrations/20260908_add_direct_message_context.sql). Mặc định
 * "personal" nếu không truyền — giữ nguyên hành vi cũ cho mọi nơi gọi
 * route này trước khi có context.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: counterpartyId } = await params;
  const context = resolveContext(new URL(request.url).searchParams.get("context"));
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: counterparty, error: counterpartyError } = await supabase
    .from("author_public_profiles")
    .select("id, nickname, username, avatar_url, is_system")
    .eq("id", counterpartyId)
    .maybeSingle();
  if (counterpartyError || !counterparty) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, body, created_at, flagged_off_platform")
    .eq("context", context)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${counterpartyId}),and(sender_id.eq.${counterpartyId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true })
    .limit(THREAD_MESSAGE_LIMIT);
  if (error) {
    console.error("[messages] thread fetch failed:", error);
    return NextResponse.json({ error: "Không tải được hội thoại." }, { status: 500 });
  }

  // Không await — đánh dấu đã đọc là tác dụng phụ, không cần chặn phản
  // hồi GET này. Chỉ đánh dấu đúng hòm thư đang mở (context), không đụng
  // tới hòm thư còn lại giữa cùng 2 người.
  supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", counterpartyId)
    .eq("recipient_id", userId)
    .eq("context", context)
    .is("read_at", null)
    .then(({ error: markReadError }) => {
      if (markReadError) console.error("[messages] mark read failed:", markReadError);
    });

  // "Đội ngũ Vịnh" chỉ hiện khi CẢ 2 điều kiện đúng: đang xem hòm thư
  // moderation VÀ đối phương thực sự là tài khoản is_system=true — không
  // chỉ dựa vào context (client có thể tự truyền context=moderation tuỳ
  // ý qua query string, đây chỉ là GET nên không tạo dữ liệu giả được,
  // nhưng vẫn kiểm cho chắc, khớp cách POST bên dưới chặn ghi sai).
  const isModerationMailbox = context === "moderation" && counterparty.is_system === true;

  return NextResponse.json({
    context,
    counterparty: {
      userId: counterparty.id,
      nickname: isModerationMailbox ? "Đội ngũ Vịnh" : counterparty.nickname,
      username: counterparty.username,
      avatarUrl: isModerationMailbox ? null : counterparty.avatar_url,
      isModerationMailbox,
    },
    messages: (rows ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      mine: m.sender_id === userId,
      // Mục 8 đặc tả: cảnh báo chỉ dành cho CHÍNH người gửi thấy — không
      // trả cờ này cho tin của đối phương.
      flagged: m.sender_id === userId ? m.flagged_off_platform : false,
    })),
  });
}

/**
 * POST /api/messages/:userId — gửi 1 tin nhắn tới :userId. Body có thể
 * kèm `context: "moderation"` (khi đang trả lời trong hòm thư kiểm
 * duyệt) — CHỈ được chấp nhận nếu recipientId đúng là tài khoản
 * is_system=true, ngược lại tự hạ về "personal". Chặn ở đây để không ai
 * tự gắn context=moderation gửi cho người khác rồi giả mạo "tin nhắn từ
 * Vịnh" (client không kiểm được, phải chặn phía server).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: recipientId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userId === recipientId) {
    return NextResponse.json({ error: "Không thể tự nhắn tin cho chính mình." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Tin nhắn không được để trống." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Tin nhắn tối đa ${BODY_MAX} ký tự.` }, { status: 400 });
  }

  const { data: recipient } = await supabase
    .from("author_public_profiles")
    .select("id, is_system")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const requestedContext = resolveContext(body?.context);
  const context: MessageContext = requestedContext === "moderation" && recipient.is_system ? "moderation" : "personal";

  // Mục 8 đặc tả — chỉ gắn nhãn, KHÔNG chặn gửi (xem off-platform-detector.ts).
  const flagged = isLikelyOffPlatform(text);

  const { data: message, error } = await supabase
    .from("direct_messages")
    .insert({ sender_id: userId, recipient_id: recipientId, body: text, flagged_off_platform: flagged, context })
    .select("id, created_at")
    .single();
  if (error || !message) {
    console.error("[messages] send failed:", error);
    return NextResponse.json({ error: "Gửi tin nhắn thất bại." }, { status: 500 });
  }

  // Chỉ tính lại Trust Score khi THỰC SỰ bị gắn nhãn (hiếm) — tránh chạy
  // 1 hàm tổng hợp nặng trên mọi tin nhắn gửi đi. Không chặn phản hồi.
  if (flagged) {
    supabase.rpc("recalculate_trust_score", { p_user_id: userId }).then(({ error: trustError }) => {
      if (trustError) console.error("[messages] recalculate trust score failed:", trustError);
    });
  }

  return NextResponse.json({
    context,
    message: { id: message.id, body: text, createdAt: message.created_at, mine: true, flagged },
  });
}
