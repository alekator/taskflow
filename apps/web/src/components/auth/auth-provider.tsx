"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getMe, login as loginApi, logout as logoutApi } from "../../lib/auth/api";
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
      const session = readSession();

      if (!session) {
        setState((prev) => ({ ...prev, isReady: true }));
        return;
      }

      try {
        const user = await getMe(session.accessToken);
        const next: AuthSession = { ...session, user };
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

  const logout = useCallback(async () => {
    const current = readSession();

    if (current?.accessToken) {
      try {
        await logoutApi(current.accessToken);
      } catch {
        // noop: local logout should proceed regardless of network status
      }
    }

    clearSession();
    setState({
      isReady: true,
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [login, logout, state],
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
