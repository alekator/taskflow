import { authFetch } from "../auth/auth-fetch";
import { buildQueryString, type PaginatedResponse } from "./shared";

export type ProjectRole = "OWNER" | "MANAGER" | "MEMBER";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: "ADMIN" | "MANAGER" | "USER";
  };
};

export async function listProjects(params?: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: "createdAt" | "name";
  sortOrder?: "asc" | "desc";
}): Promise<PaginatedResponse<Project>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<Project>>(`/projects${query}`);
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<Project> {
  return authFetch<Project>("/projects", {
    method: "POST",
    body: input,
  });
}

export async function getProject(projectId: string): Promise<Project> {
  return authFetch<Project>(`/projects/${projectId}`);
}

export async function listProjectMembers(
  projectId: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: ProjectRole;
    sortBy?: "createdAt" | "role";
    sortOrder?: "asc" | "desc";
  },
): Promise<PaginatedResponse<ProjectMember>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<ProjectMember>>(
    `/projects/${projectId}/members${query}`,
  );
}

export async function addProjectMember(
  projectId: string,
  input: { userId: string; role?: ProjectRole },
): Promise<ProjectMember> {
  return authFetch<ProjectMember>(`/projects/${projectId}/members`, {
    method: "POST",
    body: input,
  });
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(`/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

