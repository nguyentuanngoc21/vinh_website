import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";
import {
  clearRateLimit,
  getClientIp,
  normalizeRateLimitIdentifier,
  peekRateLimits,
  rateLimitedResponse,
  recordRateLimitHit,
} from "@/lib/rate-limit";

const GENERIC_ERROR = "Sai email/tên tài khoản hoặc mật khẩu.";
const LOGIN_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const remember = body?.remember !== false;

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Vui lòng nhập email/tên tài khoản và mật khẩu." },
      { status: 400 }
    );
  }

  // Chống dò mật khẩu: chỉ đếm lượt đăng nhập THẤT BẠI — 10/15 phút mỗi IP
  // và 5/15 phút mỗi email/tên tài khoản (key đúng như người dùng gõ, đã
  // chuẩn hoá hoa/thường). Kiểm tra TRƯỚC khi tra profile/gọi Supabase, nên
  // 429 trả về như nhau dù tài khoản có tồn tại hay không — không lộ gì thêm
  // so với GENERIC_ERROR. Limiter là in-memory theo instance (xem
  // lib/rate-limit.ts), GoTrue vẫn là lớp chặn cuối.
  const identifierKey = `login:id:${normalizeRateLimitIdentifier(identifier)}`;
  const limitRules = [
    { key: `login:ip:${getClientIp(request)}`, limit: 10, windowMs: LOGIN_WINDOW_MS },
    { key: identifierKey, limit: 5, windowMs: LOGIN_WINDOW_MS },
  ];
  const limited = peekRateLimits(limitRules);
  if (!limited.ok) {
    return rateLimitedResponse(
      "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.",
      limited.retryAfterSec
    );
  }

  // supabase.auth.signInWithPassword() chỉ nhận email thật — nếu người
  // dùng gõ tên tài khoản (không có "@"), resolve sang email trước bằng
  // service-role client (chưa có session ở bước này nên RLS "profiles are
  // readable by their owner" sẽ chặn nếu dùng client thường). Chỉ dùng
  // service role cho đúng 2 lệnh READ hẹp này — resolvedEmail sau đó đi
  // qua signInWithPassword() để Supabase tự xác thực mật khẩu thật, không
  // có đường nào bỏ qua bước đó.
  let email = identifier;
  if (!identifier.includes("@")) {
    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", identifier)
      .single();
    const resolvedEmail = profile ? (await admin.auth.admin.getUserById(profile.id)).data.user?.email : null;
    if (!resolvedEmail) {
      recordRateLimitHit(limitRules);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    email = resolvedEmail;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    recordRateLimitHit(limitRules);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  // Đăng nhập đúng thì xoá bộ đếm sai theo tài khoản (không xoá bộ đếm IP —
  // tránh kẻ dò mật khẩu xen 1 tài khoản của chính mình để "rửa" IP).
  clearRateLimit(identifierKey);

  // service-role, không phải `supabase` (client vừa signInWithPassword() —
  // phiên vừa thiết lập ngay trong request này, không đáng tin cậy để RLS
  // "profiles are readable by their owner" luôn nhận đúng auth.uid() kịp
  // lúc). Bug thật đã xảy ra: nếu query này thất bại (RLS chặn nhầm),
  // profile về undefined, cả 3 field (name/handle/role) CÙNG LÚC rơi về
  // fallback rỗng/"user" phía dưới — im lặng, không có lỗi nào hiện ra,
  // chỉ thấy sai role sau khi đăng nhập. Cùng lý do route register đã né
  // (xem comment ở đó) — id dùng để lọc là id auth thật Supabase vừa xác
  // thực (không phải input từ client), nên bỏ qua RLS ở đây an toàn.
  const { data: profile } = await createServiceRoleClient()
    .from("profiles")
    .select("username, nickname, role")
    .eq("id", data.user.id)
    .single();

  const session: Session = {
    email: data.user.email!,
    name: profile?.nickname ?? "",
    handle: profile?.username ?? "",
    role: profile?.role ?? "user",
  };

  return setSessionCookie(NextResponse.json(session), session, remember);
}