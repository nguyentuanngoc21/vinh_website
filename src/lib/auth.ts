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
  realname: string;
  phone: string;
  cccd: string;
  cccdFront: File;
  cccdBack: File;
};

/**
 * Calls the real auth backend at POST /api/auth/login. Wire that route
 * handler up to your database (verify the credentials, look up the user's
 * role) — this function is the one seam the UI talks to, so nothing above
 * it needs to change once that's done.
 */
export async function login(email: string, password: string, remember: boolean): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
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
 */
export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const body = new FormData();
  body.set("email", payload.email);
  body.set("username", payload.username);
  body.set("nickname", payload.nickname);
  body.set("password", payload.password);
  body.set("realname", payload.realname);
  body.set("phone", payload.phone);
  body.set("cccd", payload.cccd);
  body.set("cccdFront", payload.cccdFront);
  body.set("cccdBack", payload.cccdBack);

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

  return { ok: true, session: data as Session };
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
