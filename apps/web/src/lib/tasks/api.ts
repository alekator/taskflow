import { authFetch } from "../auth/auth-fetch";
import { buildQueryString, type PaginatedResponse } from "../projects/shared";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "TESTING" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  assigneeId: string | null;
  version: number;
};

export type WorkspaceTask = Task & {
  project: {
    id: string;
    name: string;
  };
  assignee: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

export type TaskRoadmapElementType = "path" | "rect" | "arrow" | "text" | "image";

export type TaskRoadmapElement = {
  id: string;
  type: TaskRoadmapElementType;
  x: number;
  y: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  points?: Array<{ x: number; y: number }>;
  width?: number;
  height?: number;
  toX?: number;
  toY?: number;
  text?: string;
  fontSize?: number;
  imageDataUrl?: string;
};

export type TaskRoadmapData = {
  version: number;
  taskId: string;
  viewport: { x: number; y: number; zoom: number };
  elements: TaskRoadmapElement[];
};

export type TaskRoadmapResponse = {
  taskId: string;
  data: TaskRoadmapData;
  updatedAt: string | null;
};

export async function listProjectTasks(
  projectId: string,
  params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    sortBy?: "order" | "createdAt" | "dueDate" | "title" | "priority" | "status";
    sortOrder?: "asc" | "desc";
  },
): Promise<PaginatedResponse<Task>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<Task>>(`/projects/${projectId}/tasks${query}`);
}

export async function listWorkspaceTasks(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  projectId?: string;
  sortBy?:
    | "order"
    | "createdAt"
    | "updatedAt"
    | "dueDate"
    | "title"
    | "priority"
    | "status";
  sortOrder?: "asc" | "desc";
}): Promise<PaginatedResponse<WorkspaceTask>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<WorkspaceTask>>(`/tasks${query}`);
}

export async function getWorkspaceTask(taskId: string): Promise<WorkspaceTask> {
  return authFetch<WorkspaceTask>(`/tasks/${taskId}`);
}

export async function getTaskRoadmap(taskId: string): Promise<TaskRoadmapResponse> {
  return authFetch<TaskRoadmapResponse>(`/tasks/${taskId}/roadmap`);
}

export async function updateTaskRoadmap(
  taskId: string,
  data: TaskRoadmapData,
): Promise<TaskRoadmapResponse> {
  return authFetch<TaskRoadmapResponse>(`/tasks/${taskId}/roadmap`, {
    method: "PATCH",
    body: { data },
  });
}

export async function createProjectTask(
  projectId: string,
  input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    order?: number;
    dueDate?: string;
    assigneeId?: string;
  },
): Promise<Task> {
  return authFetch<Task>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: input,
  });
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  version: number,
  input: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    order?: number;
    dueDate?: string | null;
  },
): Promise<Task> {
  return authFetch<Task>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "If-Match": String(version),
    },
    body: input,
  });
}

export async function deleteProjectTask(
  projectId: string,
  taskId: string,
  version: number,
): Promise<{ ok: boolean }> {
  return authFetch<{ ok: boolean }>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "DELETE",
    headers: {
      "If-Match": String(version),
    },
  });
}

export async function assignProjectTask(
  projectId: string,
  taskId: string,
  assigneeId: string,
): Promise<Task> {
  return authFetch<Task>(`/projects/${projectId}/tasks/${taskId}/assign`, {
    method: "PATCH",
    body: { assigneeId },
  });
}

export async function unassignProjectTask(
  projectId: string,
  taskId: string,
): Promise<Task> {
  return authFetch<Task>(`/projects/${projectId}/tasks/${taskId}/unassign`, {
    method: "PATCH",
  });
}
