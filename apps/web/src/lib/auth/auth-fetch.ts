import { API_BASE_URL } from "../env";
import { refresh as refreshApi } from "./api";
import { clearSession, readSession, writeSession } from "./storage";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

let refreshInFlight: Promise<string | null> | null = null;

async function getValidAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session?.refreshToken) return null;

  if (!refreshInFlight) {
    // Share one refresh request across all callers so parallel 401s do not
    // trigger a burst of competing refresh attempts.
    refreshInFlight = refreshApi(session.refreshToken)
      .then((tokens) => {
        const next = {
          ...session,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        };
        writeSession(next);
        return tokens.accessToken;
      })
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function authFetch<T>(
  path: string,
  init?: {
    method?: Method;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const session = readSession();

  const execute = async (token: string | null) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    return res;
  };

  let res = await execute(session?.accessToken ?? null);

  // Retry once after token refresh. The request body stays deterministic because
  // callers pass plain JSON-serializable data to authFetch.
  if (res.status === 401 && session?.refreshToken) {
    const token = await getValidAccessToken();
    if (token) {
      res = await execute(token);
    }
  }

  if (!res.ok) {
    const fallback = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const message = Array.isArray(body.message)
        ? body.message.join(", ")
        : body.message || fallback;
      throw new Error(message);
    } catch {
      throw new Error(fallback);
    }
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
