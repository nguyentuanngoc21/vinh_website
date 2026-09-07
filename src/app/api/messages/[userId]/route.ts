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
 * nhắn giữa mình và :userId TRONG ĐÚNG 1 hòm thư (context) — cùng 1 admin
 * giờ có thể có 2 hòm thư tách biệt với 1 tác giả: "personal" (chat bình
 * thường) và "moderation" (tin gỡ chương), xem
 * migrations/20260908_add_direct_message_context.sql. Danh tính người
 * gửi LUÔN hiển thị thật ở cả 2 context — context chỉ định tuyến tin
 * nhắn vào đúng hòm thư, không che giấu ai gửi. Mặc định "personal" nếu
 * không truyền — giữ nguyên hành vi cũ cho mọi nơi gọi route này trước
 * khi có context.
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
    .select("id, nickname, username, avatar_url")
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

  return NextResponse.json({
    context,
    counterparty: {
      userId: counterparty.id,
      nickname: counterparty.nickname,
      username: counterparty.username,
      avatarUrl: counterparty.avatar_url,
      // Chỉ để UI gắn 1 nhãn nhỏ "Kiểm duyệt" cạnh tên — KHÔNG dùng để
      // đổi tên/avatar hiển thị (danh tính người gửi luôn thật).
      isModerationThread: context === "moderation",
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
 * duyệt) — CHỈ được chấp nhận nếu:
 *   1. Người nhận có role admin/super_admin, VÀ
 *   2. Đã có ít nhất 1 tin context='moderation' TỪ CHÍNH người nhận đó
 *      GỬI cho người đang gửi request (tức đang trả lời 1 thông báo có
 *      thật, không phải tự bịa ra 1 "cuộc kiểm duyệt" với ai đó).
 * Ngược lại tự hạ về "personal". Chặn ở server vì client không kiểm
 * được — nếu không, ai cũng có thể tự gắn context=moderation gửi cho
 * người khác rồi giả mạo "tin nhắn kiểm duyệt".
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
    .select("id")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const requestedContext = resolveContext(body?.context);
  let context: MessageContext = "personal";
  if (requestedContext === "moderation") {
    const { data: recipientProfile } = await supabase.from("profiles").select("role").eq("id", recipientId).maybeSingle();
    const recipientIsAdmin = recipientProfile?.role === "admin" || recipientProfile?.role === "super_admin";
    if (recipientIsAdmin) {
      const { data: priorNotice } = await supabase
        .from("direct_messages")
        .select("id")
        .eq("sender_id", recipientId)
        .eq("recipient_id", userId)
        .eq("context", "moderation")
        .limit(1)
        .maybeSingle();
      if (priorNotice) context = "moderation";
    }
  }

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
