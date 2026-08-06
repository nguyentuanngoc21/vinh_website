import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Supabase client for Client Components — use this for anything that runs
 * in the browser (realtime subscriptions, optimistic client-side reads).
 * For anything that needs the user's identity trusted (auth checks, RLS
 * writes on their behalf from a Server Component / Route Handler), use
 * `@/lib/supabase/server` instead — this browser client's session can't
 * be trusted server-side.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
