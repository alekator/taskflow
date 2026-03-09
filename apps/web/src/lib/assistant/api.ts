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

export type AssistantProjectSummary = {
  project: {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
  };
  stats: {
    totalTasks: number;
    openTasks: number;
    doneTasks: number;
    overdueOpenTasks: number;
    highPriorityOpenTasks: number;
    staleOpenTasks: number;
  };
  statusBreakdown: {
    TODO: number;
    IN_PROGRESS: number;
    TESTING: number;
    DONE: number;
  };
  assigneeLoad: Array<{
    userId: string | null;
    name: string | null;
    email: string | null;
    openTasks: number;
  }>;
  recentTasks: Array<{
    id: string;
    title: string;
    status: "TODO" | "IN_PROGRESS" | "TESTING" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate: string | null;
    updatedAt: string;
    assignee: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  summary: string;
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

export async function getAssistantProjectSummary(
  projectId: string,
): Promise<AssistantProjectSummary> {
  const search = new URLSearchParams({ projectId });
  return authFetch<AssistantProjectSummary>(
    `/assistant/project-summary?${search.toString()}`,
  );
}
