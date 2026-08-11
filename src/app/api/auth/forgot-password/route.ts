import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Step 1 of the reset flow: send the "click here to reset" email.
 *
 * Always returns the same generic success message whether or not the email
 * is registered — Supabase's own resetPasswordForEmail behaves the same way
 * (no error for an unknown address), and surfacing "no account with that
 * email" here would let anyone enumerate registered accounts. Only genuine
 * request errors (missing field, Supabase outage) get a distinct message.
 *
 * The link Supabase emails points at `redirectTo` below with a `?code=...`
 * query param. /api/auth/confirm exchanges that code for a real session
 * (setting the sb-* cookies) before handing off to /dat-lai-mat-khau, which
 * is the page that actually sets the new password — see that route for why
 * the exchange has to happen server-side.
 *
 * Supabase also requires this exact origin + path to be listed under
 * Authentication → URL Configuration → Redirect URLs in the dashboard, or
 * it silently ignores redirectTo and falls back to the project's Site URL.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "Vui lòng nhập email." }, { status: 400 });
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent("/dat-lai-mat-khau")}`,
  });

  // Log-only: still return the generic success response below so the
  // response itself never reveals anything about the email/rate limit.
  if (error) {
    console.error("[forgot-password] resetPasswordForEmail failed:", error);
  }

  return NextResponse.json({
    message: "Nếu email này tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.",
  });
}
