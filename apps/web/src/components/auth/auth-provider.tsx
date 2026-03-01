"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getMe,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  type RegisterInput,
} from "../../lib/auth/api";
import { clearSession, readSession, writeSession } from "../../lib/auth/storage";
import type { AuthSession, SessionUser } from "../../lib/types";

type AuthState = {
  isReady: boolean;
  isAuthenticated: boolean;
  user: SessionUser | null;
  accessToken: string | null;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isReady: false,
    isAuthenticated: false,
    user: null,
    accessToken: null,
  });

  useEffect(() => {
    const init = async () => {
      // Revalidate the persisted session on boot so stale local storage cannot
      // keep the UI in an authenticated state after server-side logout/expiry.
      const session = readSession();

      if (!session) {
        setState((prev) => ({ ...prev, isReady: true }));
        return;
      }

      try {
        const user = await getMe(session.accessToken);
        const next: AuthSession = { ...session, user };
        // Persist the refreshed user payload so role/name changes propagate to
        // later page loads without requiring another full login.
        writeSession(next);

        setState({
          isReady: true,
          isAuthenticated: true,
          user,
          accessToken: session.accessToken,
        });
      } catch {
        clearSession();
        setState({
          isReady: true,
          isAuthenticated: false,
          user: null,
          accessToken: null,
        });
      }
    };

    void init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginApi({ email, password });
    writeSession(session);

    setState({
      isReady: true,
      isAuthenticated: true,
      user: session.user,
      accessToken: session.accessToken,
    });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await registerApi(input);
    writeSession(session);

    setState({
      isReady: true,
      isAuthenticated: true,
      user: session.user,
      accessToken: session.accessToken,
    });
  }, []);

  const logout = useCallback(async () => {
    const current = readSession();

    if (current?.accessToken) {
      try {
        await logoutApi(current.accessToken);
      } catch {
        // noop: local logout should proceed regardless of network status
      }
    }

    // Always clear local auth state even if the network request fails, because
    // the local browser should never remain "half logged out".
    clearSession();
    setState({
      isReady: true,
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [login, logout, register, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return ctx;
}
