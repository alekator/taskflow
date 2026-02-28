import { authFetch } from "../auth/auth-fetch";
import { buildQueryString, type PaginatedResponse } from "../projects/shared";

export type NotificationItem = {
  id: string;
  type: "task" | "project" | "security" | "workspace";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  action: string;
  projectId: string | null;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  isOwnAction: boolean;
};

export async function listNotifications(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<NotificationItem>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<NotificationItem>>(`/notifications${query}`);
}
