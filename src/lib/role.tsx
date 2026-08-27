"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  resetPassword as resetPasswordRequest,
  type RegisterPayload,
  type Session,
} from "@/lib/auth";

const STORAGE_KEY = "vinh_session";

type AuthOutcome = { ok: true } | { ok: false; error: string };

type RoleContextValue = {
  session: Session | null;
  isGuest: boolean;
  isLogged: boolean;
  isAdmin: boolean;
  login: (identifier: string, password: string, remember: boolean) => Promise<AuthOutcome>;
  register: (payload: RegisterPayload) => Promise<AuthOutcome>;
  resetPassword: (password: string) => Promise<AuthOutcome>;
  logout: () => void;
  /** Patches just `session.name` in the cached session after a successful
   * nickname save (src/app/api/profile/me/route.ts) — without this, the
   * top-nav avatar/name in auth-cluster.tsx keeps showing the old value
   * until the next login, since it reads the cached session, not a live
   * query. No-op if signed out. */
  updateSessionName: (name: string) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

// A minimal external store over local/session storage so reads are safe
// during SSR (server snapshot is always signed out) and re-render every
// subscriber when the session changes, without calling setState from
// inside an effect.
let cachedSession: Session | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function getSnapshot(): Session | null {
  if (!hydrated) {
    cachedSession = readStoredSession();
    hydrated = true;
  }
  return cachedSession;
}

function getServerSnapshot(): Session | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// "Remember me" decides which storage holds the session: localStorage
// survives closing the browser, sessionStorage clears with the tab.
function writeSession(session: Session | null, remember: boolean) {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (session) {
      (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
  cachedSession = session;
  hydrated = true;
  listeners.forEach((listener) => listener());
}

// Same storage-preserving idea as writeSession(), but only patches `name`
// in place — re-uses whichever storage (local vs session) already holds
// the session instead of needing the caller to know/pass `remember` again.
function patchSessionName(name: string) {
  if (!cachedSession) return;
  const updated: Session = { ...cachedSession, name };
  try {
    if (localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } else if (sessionStorage.getItem(STORAGE_KEY)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore
  }
  cachedSession = updated;
  listeners.forEach((listener) => listener());
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback(async (identifier: string, password: string, remember: boolean) => {
    const result = await loginRequest(identifier, password, remember);
    if (!result.ok) return result;
    writeSession(result.session, remember);
    return { ok: true as const };
  }, []);

  // Không sign-in ở đây nữa — register/route.ts không trả session, chỉ tạo
  // tài khoản + gửi mail xác nhận (xem RegisterResult ở lib/auth.ts). Người
  // dùng chỉ thực sự đăng nhập sau khi bấm link trong mail, qua
  // /api/auth/confirm (route đó set vinh_session, không phải ở đây).
  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await registerRequest(payload);
    if (!result.ok) return result;
    return { ok: true as const };
  }, []);

  // Reached only after the recovery-link session is already in place (see
  // /api/auth/confirm); a successful reset signs the user straight in,
  // same "remember by default" treatment as a fresh registration.
  const resetPassword = useCallback(async (password: string) => {
    const result = await resetPasswordRequest(password);
    if (!result.ok) return result;
    writeSession(result.session, true);
    return { ok: true as const };
  }, []);

  const logout = useCallback(() => {
    // Fire-and-forget: clear the server cookie without blocking the UI,
    // which flips to signed-out the moment writeSession(null, …) runs.
    void logoutRequest();
    writeSession(null, false);
  }, []);

  const updateSessionName = useCallback((name: string) => {
    patchSessionName(name);
  }, []);

  return (
    <RoleContext.Provider
      value={{
        session,
        isGuest: session === null,
        isLogged: session !== null,
        isAdmin: session?.role === "admin",
        login,
        register,
        resetPassword,
        logout,
        updateSessionName,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
