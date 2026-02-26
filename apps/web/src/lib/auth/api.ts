import { API_BASE_URL } from "../env";
import type { AuthSession, SessionUser } from "../types";

type LoginInput = {
  email: string;
  password: string;
};

type LoginResponse = {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiError = {
  statusCode: number;
  message: string;
  error: string;
};

function createApiError(statusCode: number, fallback: string): ApiError {
  return {
    statusCode,
    message: fallback,
    error: statusCode >= 500 ? "Server Error" : "Request Error",
  };
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      statusCode?: number;
      message?: string | string[];
      error?: string;
    };

    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message || `HTTP ${res.status}`;

    return {
      statusCode: body.statusCode ?? res.status,
      message,
      error: body.error ?? "Request Error",
    };
  } catch {
    return createApiError(res.status, `HTTP ${res.status}`);
  }
}

function buildUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

async function request<TResponse>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<TResponse> {
  const res = await fetch(buildUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw await readError(res);
  }

  if (res.status === 204) return undefined as TResponse;

  return (await res.json()) as TResponse;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const data = await request<LoginResponse>("POST", "/auth/login", input);

  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

export async function refresh(refreshToken: string): Promise<RefreshResponse> {
  return request<RefreshResponse>("POST", "/auth/refresh", { refreshToken });
}

export async function logout(accessToken: string): Promise<void> {
  await request<{ ok: boolean }>("POST", "/auth/logout", undefined, {
    Authorization: `Bearer ${accessToken}`,
  });
}

export async function getMe(accessToken: string): Promise<SessionUser> {
  return request<SessionUser>("GET", "/users/me", undefined, {
    Authorization: `Bearer ${accessToken}`,
  });
}
