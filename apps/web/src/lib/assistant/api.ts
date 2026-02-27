import { authFetch } from "../auth/auth-fetch";
import type { PaginatedResponse } from "../projects/shared";

export type AssistantMessageRole = "USER" | "ASSISTANT";
export type AssistantMessageMode = "BASIC" | "LLM";

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  mode: AssistantMessageMode;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type SendAssistantMessageResponse = {
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  mode: AssistantMessageMode;
  llmEnabled: boolean;
  remainingDailyLimit: number | null;
};

export async function listAssistantHistory(params?: {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}): Promise<PaginatedResponse<AssistantMessage>> {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.sortOrder) search.set("sortOrder", params.sortOrder);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return authFetch<PaginatedResponse<AssistantMessage>>(`/assistant/history${suffix}`);
}

export async function sendAssistantMessage(
  message: string,
): Promise<SendAssistantMessageResponse> {
  return authFetch<SendAssistantMessageResponse>("/assistant/messages", {
    method: "POST",
    body: { message },
  });
}

