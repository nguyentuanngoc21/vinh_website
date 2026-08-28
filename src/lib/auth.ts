export type Role = "user" | "admin" | "super_admin";
export type Session = {
  email: string;
  name: string;
  handle: string;
  role: Role;
};

export type AuthResult = { ok: true; session: Session } | { ok: false; error: string };

export type RegisterPayload = {
  email: string;
  username: string;
  nickname: string;
  password: string;
  // Toàn bộ phần "Xác minh danh tính" đều tùy chọn — có thể bổ sung sau
  // trong Thông tin cá nhân (xem src/app/api/profile/identity/route.ts và
  // src/components/profile/identity-form.tsx). realname/phone không còn
  // bắt buộc như trước. cccd/cccdFront/cccdBack phải cùng có hoặc cùng
  // không, register-form.tsx đã đảm bảo điều đó trước khi gọi.
  realname?: string;
  phone?: string;
  cccd?: string;
  cccdFront?: File;
  cccdBack?: File;
};

// Khác AuthResult: đăng ký xong KHÔNG có session ngay — tài khoản Supabase
// đã tạo (auth.users + profiles + identity_verifications) nhưng email chưa
// xác nhận, nên chưa cho vào app. /api/auth/confirm mới là nơi thực sự
// đăng nhập, sau khi người dùng bấm link trong mail (xem route đó).
export type RegisterResult = { ok: true; pendingConfirmation: true } | { ok: false; error: string };

/**
 * Calls the real auth backend at POST /api/auth/login. `identifier` is
 * email OR username — the route resolves username → email server-side
 * (profiles.username is unique) before calling Supabase's
 * signInWithPassword(), which still does the actual password check either
 * way. Named `identifier`, not `email`, so a value that's actually a
 * username doesn't sit in a misleadingly-named variable up the call chain
 * (login-form.tsx, role.tsx).
 */
export async function login(identifier: string, password: string, remember: boolean): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, remember }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Đăng nhập thất bại. Vui lòng thử lại.",
    };
  }

  return { ok: true, session: data as Session };
}

/**
 * Calls the real auth backend at POST /api/auth/register. Wire that route
 * handler up to your database (create the user, store the CCCD images
 * securely, verify uniqueness) — sent as multipart form data since it
 * carries the two ID card photos alongside the text fields.
 *
 * Returns `pendingConfirmation`, not a `Session` — the backend deliberately
 * doesn't sign the user in yet (see register/route.ts). They're signed in
 * for real once they click the emailed confirmation link and land on
 * /api/auth/confirm.
 */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  const body = new FormData();
  body.set("email", payload.email);
  body.set("username", payload.username);
  body.set("nickname", payload.nickname);
  body.set("password", payload.password);
  if (payload.realname) body.set("realname", payload.realname);
  if (payload.phone) body.set("phone", payload.phone);
  if (payload.cccd && payload.cccdFront && payload.cccdBack) {
    body.set("cccd", payload.cccd);
    body.set("cccdFront", payload.cccdFront);
    body.set("cccdBack", payload.cccdBack);
  }

  let res: Response;
  try {
    res = await fetch("/api/auth/register", { method: "POST", body });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Đăng ký thất bại. Vui lòng thử lại.",
    };
  }

  return { ok: true, pendingConfirmation: true };
}

/**
 * Calls POST /api/auth/forgot-password. Always resolves `ok: true` on a
 * well-formed request — the backend deliberately returns the same generic
 * message whether or not the email is registered (see that route), so
 * there is nothing more specific to surface here either.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult | { ok: true; message: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Có lỗi xảy ra. Vui lòng thử lại.",
    };
  }

  return { ok: true, message: data.message as string };
}

/**
 * Calls POST /api/auth/reset-password — the final step of the forgot-
 * password flow, after the user followed the emailed link (which
 * establishes the recovery session /api/auth/confirm sets up). Returns a
 * full Session on success, same shape as login/register, since the backend
 * signs the user in immediately.
 */
export async function resetPassword(password: string): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Đặt lại mật khẩu thất bại. Vui lòng thử lại.",
    };
  }

  return { ok: true, session: data as Session };
}

/**
 * Calls POST /api/auth/verify-otp with type "signup" — the manual-code
 * alternative to clicking the link in the confirmation email (see that
 * route for why the link alone isn't reliable on mobile). Returns a full
 * Session on success, same shape as login/register, since the backend
 * signs the user in immediately once the code checks out.
 */
export async function verifySignupOtp(email: string, token: string): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, type: "signup" }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Mã xác nhận không đúng. Vui lòng thử lại.",
    };
  }

  return { ok: true, session: data as Session };
}

/**
 * Calls POST /api/auth/verify-otp with type "recovery" — the manual-code
 * alternative to the emailed reset-password link. Unlike verifySignupOtp,
 * this doesn't return a Session: it only establishes the recovery session
 * (cookie) that /dat-lai-mat-khau expects to already be there, same as
 * following the link would. The actual password change + sign-in still
 * happens at resetPassword() below, after the user picks a new password.
 */
export async function verifyRecoveryOtp(email: string, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, type: "recovery" }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Mã xác nhận không đúng. Vui lòng thử lại.",
    };
  }

  return { ok: true };
}

/**
 * Calls POST /api/auth/resend-otp — re-sends the confirmation/reset email
 * (same underlying code+link) when the previous one expired or never
 * arrived. `type` mirrors verifySignupOtp/verifyRecoveryOtp above.
 */
export async function resendOtp(
  email: string,
  type: "signup" | "recovery"
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type }),
    });
  } catch {
    return { ok: false, error: "Không thể kết nối máy chủ. Vui lòng thử lại sau." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      ok: false,
      error: (data && typeof data.error === "string" && data.error) || "Gửi lại mã thất bại. Vui lòng thử lại.",
    };
  }

  return { ok: true };
}

/**
 * Clears the server-side session cookie. Best-effort: logout should still
 * clear the client-side session (localStorage/sessionStorage, in role.tsx)
 * even if this request fails, so it's never awaited from a place that
 * would block the UI.
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore — the client-side session is cleared regardless
  }
}
