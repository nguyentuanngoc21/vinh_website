import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import type { Role } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import type { Database } from "@/lib/supabase/types";

/** Người đang gọi: id trong auth.users + role mới nhất từ `profiles` (null
 * nếu đăng nhập bằng Supabase Auth thật nhưng chưa có dòng profiles). */
export type AuthedViewer = { id: string; role: Role | null };

// Supabase Auth getUser() là một lượt gọi mạng tới auth server — cache()
// để mọi helper bên dưới trong cùng một request chỉ gọi đúng một lần, bất
// kể caller truyền client nào (hàm này không nhận client).
const getSupabaseAuthUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: authUser } = await supabase.auth.getUser();
  return authUser?.user?.id ?? null;
});

// cache() so khớp tham số theo identity: gọi không truyền client → key là
// `undefined`, dùng chung một kết quả cho cả request; truyền cùng một
// client (như các page tạo một `supabase` rồi dùng lại) → cũng dùng chung.
// Hai client khác nhau thì mỗi client một lần query — vẫn đúng, chỉ không
// dedupe được.
const resolveViewer = cache(
  async (serviceClient: SupabaseClient<Database> | undefined): Promise<AuthedViewer | null> => {
    const client = serviceClient ?? createServiceRoleClient();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await decodeSession(token);

    if (session) {
      const { data } = await client.from("profiles").select("id, role").eq("username", session.handle).single();
      if (data) return { id: data.id, role: data.role };
    }

    const userId = await getSupabaseAuthUserId();
    if (!userId) return null;

    const { data } = await client.from("profiles").select("role").eq("id", userId).single();
    return { id: userId, role: data?.role ?? null };
  }
);

/**
 * Resolves the calling user's auth.users uuid AND fresh role, trying both
 * auth paths the app currently has in flight: the hand-rolled signed
 * session cookie first (stores `username`, not the uuid, so it needs one
 * profiles lookup — which also returns the role), falling back to a real
 * Supabase auth session. Returns null if neither resolves — callers should
 * respond 401.
 *
 * Wrapped in React cache(): một page gọi cả getAuthedUserId lẫn
 * getAuthedAdminId (cùng client) chỉ tốn một lượt query profiles.
 */
export function getAuthedViewer(serviceClient?: SupabaseClient<Database>): Promise<AuthedViewer | null> {
  return resolveViewer(serviceClient);
}

/** Chỉ lấy id — xem getAuthedViewer(). */
export async function getAuthedUserId(serviceClient?: SupabaseClient<Database>): Promise<string | null> {
  return (await getAuthedViewer(serviceClient))?.id ?? null;
}

/** Resolves the caller's id and fresh role (from `profiles`, not the
 * signed cookie — the cookie's role is only refreshed on login). Returns
 * null if unauthenticated OR not admin/super_admin. Use when a route or
 * page needs to tell admin apart from super_admin, e.g. role reassignment
 * (super_admin only — see src/app/api/admin/users/[userId]/route.ts). */
export async function getAuthedAdmin(
  serviceClient?: SupabaseClient<Database>
): Promise<{ id: string; role: "admin" | "super_admin" } | null> {
  const viewer = await getAuthedViewer(serviceClient);
  if (!viewer || !isAdminRole(viewer.role)) return null;
  return { id: viewer.id, role: viewer.role };
}

/** Same lookup, but also asserts admin/super_admin — for the admin bonus
 * endpoint. Returns null if unauthenticated OR not an admin. */
export async function getAuthedAdminId(serviceClient?: SupabaseClient<Database>): Promise<string | null> {
  return (await getAuthedAdmin(serviceClient))?.id ?? null;
}
