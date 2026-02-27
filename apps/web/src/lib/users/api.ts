import { authFetch } from "../auth/auth-fetch";
import { buildQueryString, type PaginatedResponse } from "../projects/shared";

export type WorkspaceUser = {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "USER";
  name: string | null;
  createdAt: string;
  projectCount: number;
  activeTasksCount: number;
  completedTasksCount: number;
  totalTasksCount: number;
  projects: Array<{
    id: string;
    name: string;
    role: "OWNER" | "MANAGER" | "MEMBER";
  }>;
};

export async function listWorkspaceUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
  role?: "ADMIN" | "MANAGER" | "USER";
  sortBy?: "createdAt" | "email" | "name" | "role";
  sortOrder?: "asc" | "desc";
}): Promise<PaginatedResponse<WorkspaceUser>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<WorkspaceUser>>(`/users${query}`);
}
