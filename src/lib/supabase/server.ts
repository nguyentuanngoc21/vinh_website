import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Supabase client for Server Components and Route Handlers. Reads/writes
 * the Supabase auth cookies via Next's `cookies()` API, so
 * `supabase.auth.getUser()` reflects the actual signed-in user — always
 * use `getUser()` (which re-validates against the auth server) rather than
 * `getSession()` (which just trusts whatever cookie is present) anywhere
 * an auth decision is being made.
 *
 * Note the `setAll` try/catch: called from a Server Component, cookie
 * writes are a no-op (Server Components can't set cookies) — that's fine
 * as long as proxy.ts is also refreshing the session on every request
 * (see the proxy snippet in docs/SUPABASE_SETUP.md).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — proxy.ts refreshes the
            // session cookie on every navigation, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * Service-role client — BYPASSES RLS ENTIRELY. Only use for narrow,
 * server-controlled writes where the target row/table is hard-coded by
 * your own code (never derived from arbitrary user input), such as:
 *
 *   - Finishing account setup right after signUp() — the new user has no
 *     active session yet if email confirmation is enabled (Supabase
 *     default), so normal RLS-checked writes (createClient()) would fail
 *     with "new row violates row-level security policy" because
 *     auth.uid() resolves to null for an unauthenticated request. This is
 *     exactly the error you'd see writing profiles/identity_verifications
 *     or uploading to Storage immediately after signUp().
 *   - Admin actions and cleanup jobs.
 *
 * NEVER use this for a write whose target (table, row id, or bucket path)
 * comes directly from user-supplied input without your own validation —
 * that would let any caller write/read anything, since RLS no longer
 * applies. In the register route, this is safe because every insert
 * targets exactly `authData.user.id` — a value Supabase Auth just
 * generated, not something the client sent us.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}