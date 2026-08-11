import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 2 of the reset flow: the user clicked the link from the reset email.
 *
 * Supabase's email link points here with a one-time `?code=...` (PKCE).
 * This has to be a server route, not a client page, because exchanging the
 * code for a session is what sets the sb-* auth cookies via
 * `createClient()`'s `setAll` (see src/lib/supabase/server.ts) — a plain
 * page component can only read cookies, not write them ahead of its own
 * render. Once exchanged, /dat-lai-mat-khau loads with a real (recovery)
 * session already in place and can call supabase.auth.updateUser().
 *
 * `next` is carried through unencoded from our own redirectTo (see
 * forgot-password/route.ts) — never taken from arbitrary user input in a
 * way that could redirect off-site.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dat-lai-mat-khau";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("[auth/confirm] exchangeCodeForSession failed:", error);
  }

  // Missing/invalid/expired code — send back to the request form with a
  // flag the page reads to show an explanatory message, instead of landing
  // silently on a reset-password form with no session.
  return NextResponse.redirect(new URL("/quen-mat-khau?error=link-het-han", url.origin));
}
