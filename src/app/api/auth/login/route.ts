import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";

const GENERIC_ERROR = "Sai email/tên tài khoản hoặc mật khẩu.";

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
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    email = resolvedEmail;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const { data: profile } = await supabase
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