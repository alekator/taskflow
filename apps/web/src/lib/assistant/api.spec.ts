import { describe, expect, it, vi } from "vitest";
import { getAssistantProjectSummary } from "./api";

const authFetch = vi.fn();

vi.mock("../auth/auth-fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}));

describe("assistant api", () => {
  it("requests project summary endpoint with projectId query", async () => {
    authFetch.mockResolvedValueOnce({ summary: "ok" });

    const result = await getAssistantProjectSummary("project-123");

    expect(result).toEqual({ summary: "ok" });
    expect(authFetch).toHaveBeenCalledWith(
      "/assistant/project-summary?projectId=project-123",
    );
  });
});
