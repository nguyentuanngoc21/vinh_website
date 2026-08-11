import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import type { Database } from "@/lib/supabase/types";

/**
 * Resolves the calling user's auth.users uuid, trying both auth paths the
 * app currently has in flight (see src/app/api/penalty/route.ts, which
 * does the same two-step lookup): the hand-rolled signed session cookie
 * first (stores `username`, not the uuid, so it needs one profiles
 * lookup), falling back to a real Supabase auth session. Returns null if
 * neither resolves — callers should respond 401.
 */
export async function getAuthedUserId(
  serviceClient: SupabaseClient<Database> = createServiceRoleClient()
): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decodeSession(token);

  if (session) {
    const { data } = await serviceClient.from("profiles").select("id").eq("username", session.handle).single();
    if (data) return data.id;
  }

  const supabase = await createClient();
  const { data: authUser } = await supabase.auth.getUser();
  return authUser?.user?.id ?? null;
}

/** Same lookup, but also asserts admin/super_admin — for the admin bonus
 * endpoint. Returns null if unauthenticated OR not an admin. */
export async function getAuthedAdminId(
  serviceClient: SupabaseClient<Database> = createServiceRoleClient()
): Promise<string | null> {
  const userId = await getAuthedUserId(serviceClient);
  if (!userId) return null;

  const { data } = await serviceClient.from("profiles").select("role").eq("id", userId).single();
  if (!data || (data.role !== "admin" && data.role !== "super_admin")) return null;
  return userId;
}
