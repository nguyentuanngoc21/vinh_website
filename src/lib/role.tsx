"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
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
  login: (email: string, password: string, remember: boolean) => Promise<AuthOutcome>;
  register: (payload: RegisterPayload) => Promise<AuthOutcome>;
  logout: () => void;
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

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const result = await loginRequest(email, password, remember);
    if (!result.ok) return result;
    writeSession(result.session, remember);
    return { ok: true as const };
  }, []);

  // A freshly registered account is signed in immediately, remembered by default.
  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await registerRequest(payload);
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

  return (
    <RoleContext.Provider
      value={{
        session,
        isGuest: session === null,
        isLogged: session !== null,
        isAdmin: session?.role === "admin",
        login,
        register,
        logout,
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
