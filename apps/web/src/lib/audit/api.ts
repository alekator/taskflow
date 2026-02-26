import { authFetch } from "../auth/auth-fetch";
import { buildQueryString, type PaginatedResponse } from "../projects/shared";

export type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  prevHash: string | null;
  hash: string | null;
  payload: unknown;
};

export async function listAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  requestId?: string;
  from?: string;
  to?: string;
}): Promise<PaginatedResponse<AuditLog>> {
  const query = buildQueryString(params);
  return authFetch<PaginatedResponse<AuditLog>>(`/audit-logs${query}`);
}
