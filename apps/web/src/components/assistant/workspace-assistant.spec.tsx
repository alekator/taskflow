import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAssistant } from "./workspace-assistant";

const mockPush = vi.fn();
const mockListHistory = vi.fn();
const mockSendMessage = vi.fn();
const mockListNotifications = vi.fn();
const mockUnreadCount = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../auth/auth-provider", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      id: "u1",
      email: "user@test.com",
      name: "User",
      role: "USER",
    },
  }),
}));

vi.mock("../../lib/assistant/api", () => ({
  listAssistantHistory: (...args: unknown[]) => mockListHistory(...args),
  sendAssistantMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

vi.mock("../../lib/notifications/api", () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  getUnreadNotificationsCount: (...args: unknown[]) => mockUnreadCount(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllRead(...args),
}));

const baseNotifications = [
  {
    id: "n1",
    type: "task",
    title: "Task moved",
    message: "Task switched to TESTING",
    href: "/app/tasks/t1",
    createdAt: "2026-03-09T10:00:00.000Z",
    action: "TASK_UPDATE",
    projectId: "p1",
    entityType: "task",
    entityId: "t1",
    actorUserId: "u2",
    requestId: "r1",
    isOwnAction: false,
    isRead: false,
    readAt: null,
  },
  {
    id: "n2",
    type: "project",
    title: "Project updated",
    message: "Description changed",
    href: "/app/projects/p1",
    createdAt: "2026-03-09T09:00:00.000Z",
    action: "PROJECT_UPDATE",
    projectId: "p1",
    entityType: "project",
    entityId: "p1",
    actorUserId: "u2",
    requestId: "r2",
    isOwnAction: false,
    isRead: true,
    readAt: "2026-03-09T09:30:00.000Z",
  },
];

describe("WorkspaceAssistant notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListHistory.mockResolvedValue({ items: [] });
    mockSendMessage.mockResolvedValue({});
    mockListNotifications.mockResolvedValue({
      items: baseNotifications,
      meta: { page: 1, limit: 24, total: 2, totalPages: 1 },
    });
    mockUnreadCount.mockResolvedValue({ unreadCount: 1 });
    mockMarkRead.mockResolvedValue({ ok: true });
    mockMarkAllRead.mockResolvedValue({ ok: true, marked: 1 });
  });

  it("loads notifications and allows filtering unread only", async () => {
    const user = userEvent.setup();
    render(<WorkspaceAssistant />);

    await user.click(screen.getByTestId("notifications-toggle"));

    await waitFor(() =>
      expect(screen.getAllByTestId("notification-item")).toHaveLength(2),
    );

    await user.click(screen.getByTestId("notifications-filter-unread"));
    await waitFor(() =>
      expect(screen.getAllByTestId("notification-item")).toHaveLength(1),
    );
    expect(screen.getByText("Task moved")).toBeInTheDocument();
    expect(screen.queryByText("Project updated")).not.toBeInTheDocument();
  });

  it("marks all notifications as read and clears unread badge", async () => {
    const user = userEvent.setup();
    render(<WorkspaceAssistant />);

    await user.click(screen.getByTestId("notifications-toggle"));
    await waitFor(() =>
      expect(screen.getAllByTestId("notification-item")).toHaveLength(2),
    );
    expect(screen.getByTestId("notifications-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(mockMarkAllRead).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("notifications-count")).not.toBeInTheDocument(),
    );
  });
});
