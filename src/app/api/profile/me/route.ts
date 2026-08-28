import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const NICKNAME_MAX = 40;
const BIO_MAX = 280;
const NICKNAME_COOLDOWN_DAYS = 30;

export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("username, nickname, bio, nickname_updated_at, created_at, cover_image_url")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  // 2 query count riêng (không phải trên `data` — profiles không có cột
  // đếm sẵn) — author_follows RLS chỉ cho follower tự thấy hàng của
  // mình, nên phải qua service-role mới đếm được cả 2 chiều. Xem
  // profile-header.tsx (trước đây hardcode 128/4.216).
  const [{ count: followingCount }, { count: followerCount }] = await Promise.all([
    supabase
      .from("author_follows")
      .select("author_id", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase
      .from("author_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("author_id", userId),
  ]);

  return NextResponse.json({
    username: data.username,
    nickname: data.nickname,
    bio: data.bio ?? "",
    nicknameUpdatedAt: data.nickname_updated_at,
    createdAt: data.created_at,
    coverImageUrl: data.cover_image_url,
    followingCount: followingCount ?? 0,
    followerCount: followerCount ?? 0,
  });
}

export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nicknameRaw = typeof body?.nickname === "string" ? body.nickname.trim() : undefined;
  const bioRaw = typeof body?.bio === "string" ? body.bio.slice(0, BIO_MAX) : undefined;

  if (nicknameRaw !== undefined && (nicknameRaw.length === 0 || nicknameRaw.length > NICKNAME_MAX)) {
    return NextResponse.json(
      { error: `Nickname phải từ 1 đến ${NICKNAME_MAX} ký tự.` },
      { status: 400 }
    );
  }
  if (nicknameRaw === undefined && bioRaw === undefined) {
    return NextResponse.json({ error: "Không có gì để lưu." }, { status: 400 });
  }

  const { data: current, error: currentError } = await supabase
    .from("profiles")
    .select("nickname, nickname_updated_at")
    .eq("id", userId)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  const update: { nickname?: string; nickname_updated_at?: string; bio?: string } = {};

  // Chỉ đụng tới nickname_updated_at khi nickname THỰC SỰ đổi giá trị —
  // gửi lại đúng nickname cũ (form submit không đổi gì) không tính là 1
  // lần đổi, không nên bị cooldown vì việc mình không làm.
  if (nicknameRaw !== undefined && nicknameRaw !== current.nickname) {
    if (current.nickname_updated_at) {
      const nextAllowed = new Date(current.nickname_updated_at);
      nextAllowed.setDate(nextAllowed.getDate() + NICKNAME_COOLDOWN_DAYS);
      if (nextAllowed > new Date()) {
        const daysLeft = Math.ceil((nextAllowed.getTime() - Date.now()) / 86_400_000);
        return NextResponse.json(
          { error: `Bạn vừa đổi nickname gần đây — có thể đổi lại sau ${daysLeft} ngày nữa.` },
          { status: 400 }
        );
      }
    }
    update.nickname = nicknameRaw;
    update.nickname_updated_at = new Date().toISOString();
  }

  if (bioRaw !== undefined) {
    update.bio = bioRaw;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) {
    console.error("[profile/me] update failed:", error);
    return NextResponse.json({ error: "Lưu thông tin thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nickname: update.nickname ?? current.nickname });
}
