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
  isRead: boolean;
  readAt: string | null;
};

export async function listNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: "task" | "project" | "security" | "workspace";
}): Promise<PaginatedResponse<NotificationItem>> {
  const query = buildQueryString({
    page: params?.page,
    limit: params?.limit,
    unreadOnly:
      params?.unreadOnly === undefined
        ? undefined
        : params.unreadOnly
          ? "true"
          : "false",
    type: params?.type,
  });
  return authFetch<PaginatedResponse<NotificationItem>>(`/notifications${query}`);
}

export async function getUnreadNotificationsCount(): Promise<{ unreadCount: number }> {
  return authFetch<{ unreadCount: number }>("/notifications/unread-count");
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean; marked: number }> {
  return authFetch<{ ok: boolean; marked: number }>("/notifications/read-all", {
    method: "PATCH",
  });
}
