import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const remember = body?.remember !== false;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Vui lòng nhập email và mật khẩu." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: "Sai email hoặc mật khẩu." }, { status: 401 });
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