import type { AuthSession } from "../types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authFetch } from "./auth-fetch";
import { refresh } from "./api";
import { clearSession, readSession, writeSession } from "./storage";

vi.mock("../env", () => ({
  API_BASE_URL: "http://api.test",
}));

vi.mock("./api", () => ({
  refresh: vi.fn(),
}));

vi.mock("./storage", () => ({
  clearSession: vi.fn(),
  readSession: vi.fn(),
  writeSession: vi.fn(),
}));

type MockedFunction<T extends (...args: never[]) => unknown> = ReturnType<
  typeof vi.fn<T>
>;

function mockResponse(
  status: number,
  body: unknown,
  statusText = "OK",
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const baseSession: AuthSession = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  user: {
    id: "u1",
    email: "user@test.com",
    role: "USER",
    name: "User",
  },
};

const mockReadSession = readSession as MockedFunction<typeof readSession>;
const mockWriteSession = writeSession as MockedFunction<typeof writeSession>;
const mockClearSession = clearSession as MockedFunction<typeof clearSession>;
const mockRefresh = refresh as MockedFunction<typeof refresh>;
const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.clearAllMocks();
  mockReadSession.mockReturnValue(baseSession);
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authFetch", () => {
  it("sends bearer token and returns json body", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await authFetch<{ ok: boolean }>("/projects");

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith("http://api.test/projects", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access-1",
      },
      body: undefined,
    });
  });

  it("refreshes once and retries request after 401", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(401, { message: "Unauthorized" }, "Unauthorized"))
      .mockResolvedValueOnce(mockResponse(200, { id: "p1" }));
    mockRefresh.mockResolvedValueOnce({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    });

    const result = await authFetch<{ id: string }>("/projects");

    expect(result).toEqual({ id: "p1" });
    expect(mockRefresh).toHaveBeenCalledWith("refresh-1");
    expect(mockWriteSession).toHaveBeenCalledWith({
      ...baseSession,
      accessToken: "access-2",
      refreshToken: "refresh-2",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("clears session and throws on failed refresh", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(401, { message: "Unauthorized" }, "Unauthorized"),
    );
    mockRefresh.mockRejectedValueOnce(new Error("refresh failed"));

    await expect(authFetch("/projects")).rejects.toThrow("401 Unauthorized");
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });
});
